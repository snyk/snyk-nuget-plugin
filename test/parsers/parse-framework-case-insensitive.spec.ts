import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import JSZip from 'jszip';
import * as dotNetFrameworkParser from '../../lib/nuget-parser/parsers/dotnet-framework-parser';

const targetFramework = {
  framework: '.NETFramework',
  original: 'net45',
  version: '4.5',
};

interface NupkgSpec {
  id: string;
  version: string;
  dependencies?: Array<{ id: string; version: string }>;
}

async function writePackage(packagesFolder: string, spec: NupkgSpec) {
  const folder = path.join(packagesFolder, `${spec.id}.${spec.version}`);
  fs.mkdirSync(folder, { recursive: true });

  const dependencies = (spec.dependencies || [])
    .map((dep) => `<dependency id="${dep.id}" version="${dep.version}" />`)
    .join('');
  const nuspec = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://schemas.microsoft.com/packaging/2011/08/nuspec.xsd">
  <metadata>
    <id>${spec.id}</id>
    <version>${spec.version}</version>
    <dependencies>${dependencies}</dependencies>
  </metadata>
</package>`;

  const zip = new JSZip();
  zip.file(`${spec.id}.nuspec`, nuspec);
  const data = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(path.join(folder, `${spec.id}.${spec.version}.nupkg`), data);
}

function emptyTree() {
  return { name: 'root', version: '1.0.0', dependencies: {} as any };
}

describe('dotnet-framework-parser package id casing', () => {
  let packagesFolder: string;

  beforeEach(() => {
    packagesFolder = fs.mkdtempSync(
      path.join(os.tmpdir(), 'nuget-case-insensitive-'),
    );
  });

  afterEach(() => {
    fs.rmSync(packagesFolder, { recursive: true, force: true });
  });

  it('resolves a lowercase nuspec dependency to the installed package casing', async () => {
    await writePackage(packagesFolder, {
      id: 'bootstrap',
      version: '3.0.0',
      dependencies: [{ id: 'jquery', version: '1.9.0' }],
    });
    await writePackage(packagesFolder, { id: 'jQuery', version: '1.9.1' });

    const tree = await dotNetFrameworkParser.parse(
      emptyTree(),
      [
        { name: 'bootstrap', version: '3.0.0' },
        { name: 'jQuery', version: '1.9.1' },
      ],
      targetFramework,
      packagesFolder,
    );

    const bootstrap = tree.dependencies.bootstrap;
    expect(bootstrap).toBeDefined();
    expect(Object.keys(bootstrap.dependencies)).toEqual(['jQuery']);
    expect(bootstrap.dependencies.jQuery).toMatchObject({
      name: 'jQuery',
      version: '1.9.1',
    });
    expect(tree.dependencies.jquery).toBeUndefined();
    expect(tree.dependencies.jQuery).toMatchObject({
      name: 'jQuery',
      version: '1.9.1',
    });
  });

  it('merges a manifest entry with a differently cased packages folder entry', async () => {
    await writePackage(packagesFolder, {
      id: 'bootstrap',
      version: '3.0.0',
      dependencies: [{ id: 'jquery', version: '1.9.0' }],
    });
    await writePackage(packagesFolder, { id: 'jQuery', version: '1.9.1' });

    const tree = await dotNetFrameworkParser.parse(
      emptyTree(),
      [
        { name: 'bootstrap', version: '3.0.0' },
        { name: 'jquery', version: '1.9.1' },
      ],
      targetFramework,
      packagesFolder,
    );

    const topLevelNames = Object.keys(tree.dependencies).sort();
    expect(topLevelNames).toEqual(['bootstrap', 'jQuery']);
    expect(tree.dependencies.jQuery.version).toBe('1.9.1');
    expect(Object.keys(tree.dependencies.bootstrap.dependencies)).toEqual([
      'jQuery',
    ]);
  });

  it('prefers the packages folder version over a differently cased manifest entry', async () => {
    await writePackage(packagesFolder, { id: 'jQuery', version: '1.9.1' });

    const tree = await dotNetFrameworkParser.parse(
      emptyTree(),
      [{ name: 'jquery', version: '1.8.0' }],
      targetFramework,
      packagesFolder,
    );

    expect(Object.keys(tree.dependencies)).toEqual(['jQuery']);
    expect(tree.dependencies.jQuery.version).toBe('1.9.1');
  });

  it('still creates a node for a dependency that is not installed', async () => {
    await writePackage(packagesFolder, {
      id: 'bootstrap',
      version: '3.0.0',
      dependencies: [
        { id: 'jquery', version: '1.9.0' },
        { id: 'Missing.Package', version: '2.0.0' },
      ],
    });
    await writePackage(packagesFolder, { id: 'jQuery', version: '1.9.1' });

    const tree = await dotNetFrameworkParser.parse(
      emptyTree(),
      [
        { name: 'bootstrap', version: '3.0.0' },
        { name: 'jQuery', version: '1.9.1' },
      ],
      targetFramework,
      packagesFolder,
    );

    const children = tree.dependencies.bootstrap.dependencies;
    expect(Object.keys(children).sort()).toEqual(['Missing.Package', 'jQuery']);
    expect(children['Missing.Package']).toMatchObject({
      name: 'Missing.Package',
      version: '2.0.0',
      dependencies: {},
    });
    expect(children.jQuery.version).toBe('1.9.1');
    expect(tree.dependencies['Missing.Package']).toBeUndefined();
  });
});
