import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import debugModule from 'debug';
import { FREQ_SYSTEM_DEPENDENCIES } from './parsers/dotnet-core-parser';

const debug = debugModule('snyk');

// Component-metadata labels use the shape sbom-export consumes: `hash:<alg>` keys
// with a lowercase-hex digest, and a `distribution:url` with credentials, query
// and fragment stripped. They are only added when the CLI passes
// includeComponentMetadata (`--include-component-metadata`).
export const HASH_SHA512_LABEL = 'hash:sha-512';
export const DISTRIBUTION_URL_LABEL = 'distribution:url';

export type ComponentMetadataLabels = Record<string, string>;

const NUGET_ORG_SERVICE_INDEX = 'https://api.nuget.org/v3/index.json';
const NUGET_ORG_FLAT_CONTAINER = 'https://api.nuget.org/v3-flatcontainer';
const SHA512_BYTES = 64;

// Companion files are tiny; the caps stop a hostile repository pointing them at
// something huge. A .nupkg is read whole, so Node's 2 GB read limit still applies.
const MAX_SHA512_FILE_BYTES = 1024;
const MAX_METADATA_FILE_BYTES = 1024 * 1024;

// MyGet's pre-authenticated feeds carry the API key in the path:
// /F/<feed>/auth/<key>/api/v3/index.json. Matches the Go producer's
// hasAuthSegment (cli-extension-dep-graph pkg/ecosystems/componentmetadata).
function hasAuthSegment(pathname: string): boolean {
  return pathname.split('/').some((segment) => {
    let decoded = segment;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      // keep the raw segment
    }
    return decoded.toLowerCase() === 'auth';
  });
}

// Reduce a URL to its identity: drop credentials, query and fragment, any of
// which can carry authentication material. Only absolute http(s) URLs qualify,
// which rules out local folder and UNC feeds. A URL with an `auth` path segment
// is rejected outright, since a missing URL costs far less than a leaked key.
// Other tokens embedded in a path cannot be recognised and are kept.
export function sanitizeUrl(rawUrl: string): string | undefined {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return undefined;
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.host) {
    return undefined;
  }
  if (hasAuthSegment(url.pathname)) {
    return undefined;
  }
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  return url.toString();
}

// NuGet's .nupkg.sha512 holds the base64 SHA-512 of the .nupkg, but sbom-export
// drops non-hex digests. Decoding is strict: Buffer.from silently skips invalid
// characters, so the input must round-trip and decode to exactly 64 bytes.
export function base64Sha512ToHex(b64: string): string | undefined {
  const trimmed = b64.trim();
  const raw = Buffer.from(trimmed, 'base64');
  if (raw.length !== SHA512_BYTES || raw.toString('base64') !== trimmed) {
    return undefined;
  }
  return raw.toString('hex');
}

// Reads a regular file, or returns undefined. stat follows symlinks, so a link
// to a device or FIFO is rejected before it is opened, rather than read until
// memory runs out or blocking forever.
function readRegularFile(
  filePath: string,
  maxBytes?: number,
): Buffer | undefined {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      debug(`Ignoring ${filePath}: not a regular file`);
      return undefined;
    }
    if (maxBytes !== undefined && stat.size > maxBytes) {
      debug(`Ignoring ${filePath}: larger than ${maxBytes} bytes`);
      return undefined;
    }
    return fs.readFileSync(filePath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      debug(`Could not read ${filePath}: ${error}`);
    }
    return undefined;
  }
}

function sha512FileHex(filePath: string): string | undefined {
  const data = readRegularFile(filePath);
  if (data === undefined) {
    return undefined;
  }
  return crypto.createHash('sha512').update(data).digest('hex');
}

function readSha512File(filePath: string): string | undefined {
  const data = readRegularFile(filePath, MAX_SHA512_FILE_BYTES);
  if (data === undefined) {
    return undefined;
  }
  const hex = base64Sha512ToHex(data.toString('utf-8'));
  if (hex === undefined) {
    debug(`Ignoring malformed ${filePath}`);
  }
  return hex;
}

// The feed a package was restored from, as NuGet records it in .nupkg.metadata.
function readMetadataSource(packageDir: string): string | undefined {
  const data = readRegularFile(
    path.join(packageDir, '.nupkg.metadata'),
    MAX_METADATA_FILE_BYTES,
  );
  if (data === undefined) {
    return undefined;
  }
  try {
    const source = JSON.parse(data.toString('utf-8'))?.source;
    return typeof source === 'string' ? source : undefined;
  } catch {
    debug(`Ignoring malformed .nupkg.metadata in ${packageDir}`);
    return undefined;
  }
}

// For nuget.org we can build the .nupkg's own URL. Any other http(s) feed gets
// its sanitised service index URL: resolving its PackageBaseAddress would need a
// network call, which this plugin does not make. Local feeds get no URL.
export function distributionUrl(
  source: string | undefined,
  id: string,
  version: string,
): string | undefined {
  if (!source) {
    return undefined;
  }
  const clean = sanitizeUrl(source);
  if (!clean) {
    return undefined;
  }
  if (clean.toLowerCase() === NUGET_ORG_SERVICE_INDEX) {
    const lowerId = encodeURIComponent(id.toLowerCase());
    const lowerVersion = encodeURIComponent(version.toLowerCase());
    return `${NUGET_ORG_FLAT_CONTAINER}/${lowerId}/${lowerVersion}/${lowerId}.${lowerVersion}.nupkg`;
  }
  return clean;
}

function buildLabels(
  hash: string | undefined,
  url: string | undefined,
): ComponentMetadataLabels {
  const labels: ComponentMetadataLabels = {};
  if (hash) {
    labels[HASH_SHA512_LABEL] = hash;
  }
  if (url) {
    labels[DISTRIBUTION_URL_LABEL] = url;
  }
  return labels;
}

// PackageReference: packages live at <folder>/<id>/<version>/ (both lowercase)
// in one of the assets file's packageFolders. The first folder with a valid
// .nupkg.sha512 wins; failing that, the first folder with the .nupkg is hashed.
// libraries[*].sha512 in project.assets.json is NuGet's content hash, not the
// file's hash, so it is never used.
export function packageReferenceLabels(
  id: string,
  version: string,
  packageFolders: string[],
): ComponentMetadataLabels {
  const lowerId = id.toLowerCase();
  const lowerVersion = version.toLowerCase();
  const nupkgName = `${lowerId}.${lowerVersion}.nupkg`;
  const packageDirs = packageFolders.map((folder) =>
    path.join(folder, lowerId, lowerVersion),
  );

  let hash: string | undefined;
  let hashDir: string | undefined;
  for (const dir of packageDirs) {
    hash = readSha512File(path.join(dir, `${nupkgName}.sha512`));
    if (hash) {
      hashDir = dir;
      break;
    }
  }
  if (!hash) {
    for (const dir of packageDirs) {
      hash = sha512FileHex(path.join(dir, nupkgName));
      if (hash) {
        hashDir = dir;
        break;
      }
    }
  }

  // The URL must describe the file the hash describes, so read the metadata
  // beside it; with no hash, use the first folder that has metadata.
  let source: string | undefined;
  if (hashDir) {
    source = readMetadataSource(hashDir);
  } else {
    for (const dir of packageDirs) {
      source = readMetadataSource(dir);
      if (source) {
        break;
      }
    }
  }

  return buildLabels(hash, distributionUrl(source, id, version));
}

// packages.config: packages live at <packagesFolder>/<id>.<version>/, and the
// .nupkg there is the file nuspec-parser already opens. NuGet writes neither a
// .nupkg.sha512 nor a .nupkg.metadata there (only the v3 global packages folder
// gets them), so the .nupkg is hashed and there is no source for a URL.
// Falling back to the nuget.config sources is a follow-up.
export function packagesConfigLabels(
  id: string,
  version: string,
  packagesFolder: string,
): ComponentMetadataLabels {
  const nupkg = path.resolve(
    packagesFolder,
    `${id}.${version}`,
    `${id}.${version}.nupkg`,
  );
  return buildLabels(sha512FileHex(nupkg), undefined);
}

// The assets file's packageFolders, absolute paths only: a relative key would
// resolve against the working directory, letting a repository point the
// plugin at arbitrary files of its own.
export function packageFoldersFromAssets(manifest: any): string[] {
  const folders = manifest?.packageFolders;
  if (!folders || typeof folders !== 'object') {
    return [];
  }
  return Object.keys(folders).filter((folder) => {
    if (!path.isAbsolute(folder)) {
      debug(`Ignoring relative package folder ${folder}`);
      return false;
    }
    return true;
  });
}

// The lowercase `id/version` keys of the assets file's libraries that are
// packages. Project references can share a published package's id and
// version, and must not get its hash.
export function packageLibrariesFromAssets(manifest: any): Set<string> {
  const keys = new Set<string>();
  for (const [key, library] of Object.entries<any>(manifest?.libraries || {})) {
    if (library?.type === 'package') {
      keys.add(key.toLowerCase());
    }
  }
  return keys;
}

// Attach labels to every package node of a dep tree, leaving out the root and
// the synthetic freqSystemDependencies node. Nodes without metadata are left
// untouched, so the tree only changes where there is something to report.
export function labelDepTree(
  tree: any,
  labelsFor: (id: string, version: string) => ComponentMetadataLabels,
): void {
  const cache = new Map<string, ComponentMetadataLabels>();
  // The parsers share a package's node across every edge that reaches it, and
  // a dependency cycle reaches it again from below, so each node object is
  // walked once.
  const visited = new Set<object>();
  const visit = (node: any) => {
    for (const child of Object.values<any>(node?.dependencies || {})) {
      if (!child || visited.has(child)) {
        continue;
      }
      visited.add(child);
      if (child.name !== FREQ_SYSTEM_DEPENDENCIES && child.version) {
        const key = `${child.name}@${child.version}`;
        let labels = cache.get(key);
        if (labels === undefined) {
          labels = labelsFor(child.name, child.version);
          cache.set(key, labels);
        }
        if (Object.keys(labels).length > 0) {
          child.labels = { ...(child.labels || {}), ...labels };
        }
      }
      visit(child);
    }
  };
  visit(tree);
}
