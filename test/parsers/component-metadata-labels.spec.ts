import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { execFileSync } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import JSZip from 'jszip';
import { legacy } from '@snyk/dep-graph';
import * as plugin from '../../lib';
import {
  base64Sha512ToHex,
  sha512FileHex,
  distributionUrl,
  labelDepTree,
  sanitizeUrl,
} from '../../lib/nuget-parser/component-metadata-labels';

// Fixtures are generated per test in a temp dir, shaped like what NuGet writes:
// a .nupkg zip holding a .nuspec, a .nupkg.sha512 holding the base64 SHA-512 of
// the .nupkg with no trailing newline, and a .nupkg.metadata JSON file.

const NUGET_ORG = 'https://api.nuget.org/v3/index.json';

function sha512Hex(data: Buffer | string): string {
  return crypto.createHash('sha512').update(data).digest('hex');
}

function sha512Base64(data: Buffer | string): string {
  return crypto.createHash('sha512').update(data).digest('base64');
}

function nupkgBytes(id: string, version: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    `${id}.nuspec`,
    `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://schemas.microsoft.com/packaging/2011/08/nuspec.xsd">
  <metadata>
    <id>${id}</id>
    <version>${version}</version>
  </metadata>
</package>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

function metadataJson(source: string): string {
  return JSON.stringify(
    {
      version: 2,
      contentHash:
        'notTheFileHash+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
      source,
    },
    null,
    2,
  );
}

interface GlobalPackageSpec {
  sha512?: string; // exact .nupkg.sha512 contents
  nupkg?: Buffer;
  source?: string;
}

// Writes <folder>/<id-lower>/<version-lower>/... as the global packages folder does.
function writeGlobalPackage(
  folder: string,
  id: string,
  version: string,
  spec: GlobalPackageSpec,
) {
  const dir = path.join(folder, id.toLowerCase(), version.toLowerCase());
  fs.mkdirSync(dir, { recursive: true });
  const base = `${id.toLowerCase()}.${version.toLowerCase()}.nupkg`;
  if (spec.nupkg) {
    fs.writeFileSync(path.join(dir, base), spec.nupkg);
  }
  if (spec.sha512 !== undefined) {
    fs.writeFileSync(path.join(dir, `${base}.sha512`), spec.sha512);
  }
  if (spec.source !== undefined) {
    fs.writeFileSync(
      path.join(dir, '.nupkg.metadata'),
      metadataJson(spec.source),
    );
  }
}

// A PackageReference project restored against `packageFolders`, depending
// directly on each package in `packages`.
function writeAssetsProject(
  projectDir: string,
  packageFolders: string[],
  packages: Array<{
    id: string;
    version: string;
    type?: 'package' | 'project';
    dependencies?: Record<string, string>;
  }>,
  direct: string[] = packages.map((p) => p.id),
): string {
  fs.mkdirSync(path.join(projectDir, 'obj'), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, 'app.csproj'),
    `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>`,
  );
  const target: Record<string, any> = {};
  const libraries: Record<string, any> = {};
  const deps: Record<string, any> = {};
  for (const { id, version, type = 'package', dependencies } of packages) {
    target[`${id}/${version}`] = { type, dependencies };
    libraries[`${id}/${version}`] =
      type === 'package'
        ? {
            // The content hash, which must never become the file hash label.
            sha512:
              'zanbjWC0Y05gbx4eGXkzVycOQqVOFVeCjSsDSbLEXtmMSNbb9mY5xBRwVdHg0/f3Phfn2HJgR25dRWtKDZn+aQ==',
            type,
            path: `${id.toLowerCase()}/${version.toLowerCase()}`,
          }
        : { type, path: `../${id}/${id}.csproj` };
  }
  for (const id of direct) {
    const pkg = packages.find((p) => p.id === id);
    deps[id] = { target: 'Package', version: `[${pkg?.version}, )` };
  }
  const assets = {
    version: 3,
    targets: { 'net8.0': target },
    libraries,
    packageFolders: Object.fromEntries(packageFolders.map((f) => [f, {}])),
    project: {
      version: '1.0.0',
      restore: { projectName: 'app' },
      frameworks: { 'net8.0': { targetAlias: 'net8.0', dependencies: deps } },
    },
  };
  fs.writeFileSync(
    path.join(projectDir, 'obj', 'project.assets.json'),
    JSON.stringify(assets),
  );
  return 'obj/project.assets.json';
}

async function inspectTree(root: string, targetFile: string, options: any) {
  const result: any = await plugin.inspect(root, targetFile, options);
  return result.package;
}

describe('component metadata labels', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nuget-component-metadata-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  describe('PackageReference (project.assets.json)', () => {
    const id = 'Castle.Core';
    const version = '4.4.1';
    const flatContainerUrl =
      'https://api.nuget.org/v3-flatcontainer/castle.core/4.4.1/castle.core.4.4.1.nupkg';

    function setUp(folders: string[]) {
      const projectDir = path.join(tmp, 'app');
      const targetFile = writeAssetsProject(projectDir, folders, [
        { id, version },
      ]);
      return { projectDir, targetFile };
    }

    it('leaves the tree unchanged when the option is off', async () => {
      const folder = path.join(tmp, 'global');
      const nupkg = await nupkgBytes(id, version);
      writeGlobalPackage(folder, id, version, {
        nupkg,
        sha512: sha512Base64(nupkg),
        source: NUGET_ORG,
      });
      const { projectDir, targetFile } = setUp([folder]);

      const off = await inspectTree(projectDir, targetFile, {});
      const explicitOff = await inspectTree(projectDir, targetFile, {
        includeComponentMetadata: false,
      });

      expect(off.dependencies[id]).toEqual({
        name: id,
        version,
        dependencies: {},
      });
      expect(explicitOff).toEqual(off);
    });

    it('uses the .nupkg.sha512 in the first folder and the nuget.org file URL', async () => {
      const folder = path.join(tmp, 'global');
      const nupkg = await nupkgBytes(id, version);
      // A .sha512 that differs from the .nupkg proves the companion file is read
      // rather than the .nupkg rehashed.
      writeGlobalPackage(folder, id, version, {
        nupkg,
        sha512: sha512Base64('recorded by nuget'),
        source: NUGET_ORG,
      });
      const { projectDir, targetFile } = setUp([folder]);

      const tree = await inspectTree(projectDir, targetFile, {
        includeComponentMetadata: true,
      });

      expect(tree.labels).toBeUndefined();
      expect(tree.dependencies[id].labels).toEqual({
        'hash:sha-512': sha512Hex('recorded by nuget'),
        'distribution:url': flatContainerUrl,
      });
    });

    it('keeps the labels when the CLI converts the tree to a dep graph', async () => {
      const folder = path.join(tmp, 'global');
      writeGlobalPackage(folder, id, version, {
        sha512: sha512Base64('recorded by nuget'),
        source: NUGET_ORG,
      });
      const { projectDir, targetFile } = setUp([folder]);
      const tree = await inspectTree(projectDir, targetFile, {
        includeComponentMetadata: true,
      });

      const depGraph = await legacy.depTreeToGraph(tree, 'nuget');
      const node = depGraph
        .toJSON()
        .graph.nodes.find((n) => n.pkgId === `${id}@${version}`);

      expect(node?.info?.labels).toEqual({
        'hash:sha-512': sha512Hex('recorded by nuget'),
        'distribution:url': flatContainerUrl,
      });
    });

    it('finds the .nupkg.sha512 in the second folder when the first lacks the package', async () => {
      const first = path.join(tmp, 'global');
      const second = path.join(tmp, 'fallback');
      fs.mkdirSync(first, { recursive: true });
      writeGlobalPackage(second, id, version, {
        sha512: sha512Base64('second folder'),
        source: NUGET_ORG,
      });
      const { projectDir, targetFile } = setUp([first, second]);

      const tree = await inspectTree(projectDir, targetFile, {
        includeComponentMetadata: true,
      });

      expect(tree.dependencies[id].labels).toEqual({
        'hash:sha-512': sha512Hex('second folder'),
        'distribution:url': flatContainerUrl,
      });
    });

    it('prefers a .nupkg.sha512 in a later folder over hashing a .nupkg in an earlier one', async () => {
      const first = path.join(tmp, 'global');
      const second = path.join(tmp, 'fallback');
      writeGlobalPackage(first, id, version, {
        nupkg: await nupkgBytes(id, version),
      });
      writeGlobalPackage(second, id, version, {
        sha512: sha512Base64('second folder'),
      });
      const { projectDir, targetFile } = setUp([first, second]);

      const tree = await inspectTree(projectDir, targetFile, {
        includeComponentMetadata: true,
      });

      expect(tree.dependencies[id].labels).toEqual({
        'hash:sha-512': sha512Hex('second folder'),
      });
    });

    it('hashes the .nupkg when no folder has a .nupkg.sha512', async () => {
      const folder = path.join(tmp, 'global');
      const nupkg = await nupkgBytes(id, version);
      writeGlobalPackage(folder, id, version, { nupkg });
      const { projectDir, targetFile } = setUp([folder]);

      const tree = await inspectTree(projectDir, targetFile, {
        includeComponentMetadata: true,
      });

      expect(tree.dependencies[id].labels).toEqual({
        'hash:sha-512': sha512Hex(nupkg),
      });
    });

    it('falls back to hashing the .nupkg when the .nupkg.sha512 is malformed', async () => {
      const folder = path.join(tmp, 'global');
      const nupkg = await nupkgBytes(id, version);
      writeGlobalPackage(folder, id, version, {
        nupkg,
        sha512: 'not base64 at all!!',
      });
      const { projectDir, targetFile } = setUp([folder]);

      const tree = await inspectTree(projectDir, targetFile, {
        includeComponentMetadata: true,
      });

      expect(tree.dependencies[id].labels).toEqual({
        'hash:sha-512': sha512Hex(nupkg),
      });
    });

    it('emits no hash when neither file exists, and no labels at all without metadata', async () => {
      const withMetadata = path.join(tmp, 'global');
      writeGlobalPackage(withMetadata, id, version, { source: NUGET_ORG });
      const { projectDir, targetFile } = setUp([withMetadata]);

      const tree = await inspectTree(projectDir, targetFile, {
        includeComponentMetadata: true,
      });
      expect(tree.dependencies[id].labels).toEqual({
        'distribution:url': flatContainerUrl,
      });

      const empty = path.join(tmp, 'empty');
      fs.mkdirSync(empty);
      const bare = setUp([empty]);
      const bareTree = await inspectTree(bare.projectDir, bare.targetFile, {
        includeComponentMetadata: true,
      });
      expect(bareTree.dependencies[id]).not.toHaveProperty('labels');
    });

    it('never uses libraries[*].sha512 from the assets file', async () => {
      const folder = path.join(tmp, 'global');
      fs.mkdirSync(folder);
      const { projectDir, targetFile } = setUp([folder]);

      const tree = await inspectTree(projectDir, targetFile, {
        includeComponentMetadata: true,
      });

      expect(tree.dependencies[id]).not.toHaveProperty('labels');
    });

    it.each([
      {
        description: 'a custom feed',
        source: 'https://pkgs.example.com/nuget/v3/index.json',
        expected: 'https://pkgs.example.com/nuget/v3/index.json',
      },
      {
        description: 'a credentialed feed URL',
        source:
          'https://u:p@feed.example/_packaging/feed/nuget/v3/index.json?x=1#frag',
        expected: 'https://feed.example/_packaging/feed/nuget/v3/index.json',
      },
      {
        description: 'a plain-http feed',
        source: 'http://nuget.internal:8080/v3/index.json',
        expected: 'http://nuget.internal:8080/v3/index.json',
      },
      {
        description: 'a MyGet pre-authenticated feed',
        source: 'https://feed.example/F/feed/auth/KEY/api/v3/index.json',
      },
      { description: 'a local folder feed', source: '/opt/feeds/local' },
      { description: 'a Windows folder feed', source: 'C:\\feeds\\local' },
      { description: 'a UNC share feed', source: '\\\\server\\share\\feed' },
    ])(
      'labels the distribution URL for $description',
      async ({ source, expected }) => {
        const folder = path.join(tmp, 'global');
        writeGlobalPackage(folder, id, version, {
          sha512: sha512Base64('x'),
          source,
        });
        const { projectDir, targetFile } = setUp([folder]);

        const tree = await inspectTree(projectDir, targetFile, {
          includeComponentMetadata: true,
        });

        expect(tree.dependencies[id].labels['distribution:url']).toEqual(
          expected,
        );
      },
    );

    it('does not label a project reference that shares a package id and version', async () => {
      const folder = path.join(tmp, 'global');
      writeGlobalPackage(folder, id, version, {
        sha512: sha512Base64('published package'),
        source: NUGET_ORG,
      });
      const projectDir = path.join(tmp, 'app');
      const targetFile = writeAssetsProject(
        projectDir,
        [folder],
        [{ id, version, type: 'project' }],
      );

      const tree = await inspectTree(projectDir, targetFile, {
        includeComponentMetadata: true,
      });

      expect(tree.dependencies[id]).toBeDefined();
      expect(tree.dependencies[id]).not.toHaveProperty('labels');
    });

    it('labels freqSystemDependencies children but not the synthetic node', async () => {
      const folder = path.join(tmp, 'global');
      writeGlobalPackage(folder, 'System.Runtime', '4.3.0', {
        sha512: sha512Base64('system runtime'),
      });
      const projectDir = path.join(tmp, 'app');
      const targetFile = writeAssetsProject(
        projectDir,
        [folder],
        [
          { id, version, dependencies: { 'System.Runtime': '4.3.0' } },
          { id: 'System.Runtime', version: '4.3.0' },
        ],
        [id],
      );

      const tree = await inspectTree(projectDir, targetFile, {
        includeComponentMetadata: true,
      });

      const freq = tree.dependencies.freqSystemDependencies;
      expect(freq).toBeDefined();
      expect(freq).not.toHaveProperty('labels');
      expect(freq.dependencies['System.Runtime'].labels).toEqual({
        'hash:sha-512': sha512Hex('system runtime'),
      });
    });

    it('ignores relative packageFolders, which would resolve against the cwd', async () => {
      const relative = path.relative(process.cwd(), path.join(tmp, 'global'));
      writeGlobalPackage(path.join(tmp, 'global'), id, version, {
        sha512: sha512Base64('x'),
      });
      expect(path.isAbsolute(relative)).toBe(false);
      const { projectDir, targetFile } = setUp([relative]);

      const tree = await inspectTree(projectDir, targetFile, {
        includeComponentMetadata: true,
      });

      expect(tree.dependencies[id]).not.toHaveProperty('labels');
    });

    describe('with hostile companion files', () => {
      function packageDir(folder: string) {
        const dir = path.join(folder, 'castle.core', '4.4.1');
        fs.mkdirSync(dir, { recursive: true });
        return dir;
      }

      it.each(['castle.core.4.4.1.nupkg.sha512', '.nupkg.metadata'])(
        'ignores %s symlinked to /dev/zero',
        async (file) => {
          const folder = path.join(tmp, 'global');
          const dir = packageDir(folder);
          const nupkg = await nupkgBytes(id, version);
          fs.writeFileSync(path.join(dir, 'castle.core.4.4.1.nupkg'), nupkg);
          fs.symlinkSync('/dev/zero', path.join(dir, file));
          const { projectDir, targetFile } = setUp([folder]);

          const tree = await inspectTree(projectDir, targetFile, {
            includeComponentMetadata: true,
          });

          expect(tree.dependencies[id].labels).toEqual({
            'hash:sha-512': sha512Hex(nupkg),
          });
        },
      );

      it('ignores a .nupkg symlinked to /dev/zero', async () => {
        const folder = path.join(tmp, 'global');
        const dir = packageDir(folder);
        fs.symlinkSync('/dev/zero', path.join(dir, 'castle.core.4.4.1.nupkg'));
        const { projectDir, targetFile } = setUp([folder]);

        const tree = await inspectTree(projectDir, targetFile, {
          includeComponentMetadata: true,
        });

        expect(tree.dependencies[id]).not.toHaveProperty('labels');
      });

      it('ignores a .nupkg.metadata that is a FIFO', async () => {
        const folder = path.join(tmp, 'global');
        const dir = packageDir(folder);
        execFileSync('mkfifo', [path.join(dir, '.nupkg.metadata')]);
        const { projectDir, targetFile } = setUp([folder]);

        const tree = await inspectTree(projectDir, targetFile, {
          includeComponentMetadata: true,
        });

        expect(tree.dependencies[id]).not.toHaveProperty('labels');
      });

      it.each([
        { file: 'castle.core.4.4.1.nupkg.sha512', size: 1025 },
        { file: '.nupkg.metadata', size: 1024 * 1024 + 1 },
      ])('ignores an oversized $file', async ({ file, size }) => {
        const folder = path.join(tmp, 'global');
        const dir = packageDir(folder);
        // Valid content padded past the cap, so only the size check rejects it.
        const content =
          file === '.nupkg.metadata'
            ? metadataJson(NUGET_ORG)
            : sha512Base64('x');
        fs.writeFileSync(path.join(dir, file), content.padEnd(size, ' '));
        const { projectDir, targetFile } = setUp([folder]);

        const tree = await inspectTree(projectDir, targetFile, {
          includeComponentMetadata: true,
        });

        expect(tree.dependencies[id]).not.toHaveProperty('labels');
      });
    });
  });

  describe('packages.config', () => {
    const id = 'Newtonsoft.Json';
    const version = '13.0.3';

    async function setUp() {
      // <solution>/packages/<id>.<version>/ is the default packages folder for
      // <solution>/<project>/packages.config.
      const solution = path.join(tmp, 'solution');
      const projectDir = path.join(solution, 'app');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(
        path.join(projectDir, 'packages.config'),
        `<?xml version="1.0" encoding="utf-8"?>
<packages>
  <package id="${id}" version="${version}" targetFramework="net472" />
</packages>`,
      );
      fs.writeFileSync(
        path.join(projectDir, 'app.csproj'),
        `<Project><PropertyGroup><TargetFrameworkVersion>v4.7.2</TargetFrameworkVersion></PropertyGroup></Project>`,
      );
      const packageDir = path.join(solution, 'packages', `${id}.${version}`);
      fs.mkdirSync(packageDir, { recursive: true });
      const nupkg = await nupkgBytes(id, version);
      fs.writeFileSync(path.join(packageDir, `${id}.${version}.nupkg`), nupkg);
      return { projectDir, nupkg };
    }

    it('leaves the tree unchanged when the option is off', async () => {
      const { projectDir } = await setUp();

      const tree = await inspectTree(projectDir, 'packages.config', {});

      expect(tree.dependencies[id]).toEqual({
        name: id,
        version,
        dependencies: {},
      });
    });

    it('labels the SHA-512 of the .nupkg in the packages folder', async () => {
      const { projectDir, nupkg } = await setUp();

      const tree = await inspectTree(projectDir, 'packages.config', {
        includeComponentMetadata: true,
      });

      expect(tree.dependencies[id].labels).toEqual({
        'hash:sha-512': sha512Hex(nupkg),
      });
    });
  });

  describe('label helpers', () => {
    it('hashes a .nupkg that spans several read chunks', () => {
      const file = path.join(tmp, 'big.nupkg');
      // 200 KB of random bytes spans several 64 KB chunks and a partial one.
      const data = crypto.randomBytes(200 * 1024 + 123);
      fs.writeFileSync(file, data);

      expect(sha512FileHex(file)).toEqual(
        crypto.createHash('sha512').update(data).digest('hex'),
      );
    });

    it('returns no hash for a missing or non-regular .nupkg', () => {
      expect(sha512FileHex(path.join(tmp, 'missing.nupkg'))).toBeUndefined();
      expect(sha512FileHex(tmp)).toBeUndefined();
    });

    it('converts a real .nupkg.sha512 value to lowercase hex', () => {
      // anglesharp 0.14.0 from nuget.org; hex computed with `base64 -d | xxd -p`.
      expect(
        base64Sha512ToHex(
          'ABcwIM6ehYh6y0OVYMhJ525BsLPi6WhPenCYZa0uQf+tQihdUYPA9oy0i3l1InOIs0zDJBIL+lQpxwNbTKZSaQ==',
        ),
      ).toEqual(
        '00173020ce9e85887acb439560c849e76e41b0b3e2e9684f7a709865ad2e41ffad42285d5183c0f68cb48b7975227388b34cc324120bfa5429c7035b4ca65269',
      );
    });

    it.each([
      { description: 'empty', value: '' },
      { description: 'invalid characters', value: 'not base64 at all!!' },
      {
        description: 'a SHA-256 digest',
        value: sha512Base64('x').slice(0, 44),
      },
      {
        description: 'missing padding',
        value: sha512Base64('x').replace(/=+$/, ''),
      },
      { description: 'hex instead of base64', value: sha512Hex('x') },
    ])('rejects a .nupkg.sha512 that is $description', ({ value }) => {
      expect(base64Sha512ToHex(value)).toBeUndefined();
    });

    it('tolerates surrounding whitespace in a .nupkg.sha512', () => {
      expect(base64Sha512ToHex(`${sha512Base64('x')}\r\n`)).toEqual(
        sha512Hex('x'),
      );
    });

    it.each([
      ['ftp://example.com/feed', undefined],
      ['file:///opt/feed', undefined],
      ['not a url', undefined],
      ['https://u:p@feed.example/a/b?x=1#y', 'https://feed.example/a/b'],
      ['https://feed.example/F/feed/auth/KEY/api/v3/index.json', undefined],
      ['https://feed.example/F/feed/AUTH/KEY/api/v3/index.json', undefined],
      ['https://feed.example/F/feed/%61uth/KEY/api/v3/index.json', undefined],
      [
        'https://feed.example/oauth/authors/v3/index.json',
        'https://feed.example/oauth/authors/v3/index.json',
      ],
      // A package or feed can be called auth; only /F/<feed>/auth/<key>/ carries a key.
      [
        'https://api.nuget.org/v3-flatcontainer/auth/1.0.0/auth.1.0.0.nupkg',
        'https://api.nuget.org/v3-flatcontainer/auth/1.0.0/auth.1.0.0.nupkg',
      ],
      [
        'https://feed.example/F/auth/api/v3/index.json',
        'https://feed.example/F/auth/api/v3/index.json',
      ],
    ])('sanitizes %s', (input, expected) => {
      expect(sanitizeUrl(input)).toEqual(expected);
    });

    it('matches nuget.org case-insensitively and lowercases id and version', () => {
      expect(
        distributionUrl(
          'HTTPS://API.NUGET.ORG/v3/index.json',
          'Foo.Bar',
          '1.0.0-Beta',
        ),
      ).toEqual(
        'https://api.nuget.org/v3-flatcontainer/foo.bar/1.0.0-beta/foo.bar.1.0.0-beta.nupkg',
      );
      expect(distributionUrl(undefined, 'a', '1.0.0')).toBeUndefined();
    });
  });
});

describe('labelDepTree on shared and cyclic trees', () => {
  // The core parser shares each package's dependencies object across edges,
  // so the walk must visit each node once.
  it('labels a cyclic tree without looping', () => {
    const a: any = { name: 'A', version: '1.0.0', dependencies: {} };
    const b: any = { name: 'B', version: '1.0.0', dependencies: {} };
    a.dependencies.B = b;
    b.dependencies.A = a;
    const root: any = {
      name: 'root',
      version: '0.0.0',
      dependencies: { A: a },
    };

    labelDepTree(root, (id) => ({ 'hash:sha-512': `h-${id}` }));

    expect(a.labels).toEqual({ 'hash:sha-512': 'h-A' });
    expect(b.labels).toEqual({ 'hash:sha-512': 'h-B' });
  });

  it('walks a shared subtree once', () => {
    const shared: any = { name: 'S', version: '1.0.0', dependencies: {} };
    const root: any = {
      name: 'root',
      version: '0.0.0',
      dependencies: {
        X: { name: 'X', version: '1.0.0', dependencies: { S: shared } },
        Y: { name: 'Y', version: '1.0.0', dependencies: { S: shared } },
      },
    };
    const calls: string[] = [];

    labelDepTree(root, (id) => {
      calls.push(id);
      return {};
    });

    expect(calls.sort()).toEqual(['S', 'X', 'Y']);
  });
});
