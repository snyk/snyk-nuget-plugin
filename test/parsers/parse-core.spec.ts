import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as plugin from '../../lib';

describe('when parsing .NET core', () => {
  describe('with different target monikers', () => {
    const projectPath = './test/fixtures/CoreDifferentTargetMonikers/';
    const manifestFile = 'obj/project.assets.json';
    const expectedTree = JSON.parse(
      fs.readFileSync(
        './test/fixtures/CoreDifferentTargetMonikers/expected.json',
        'utf-8',
      ),
    );

    it('parses correctly', async () => {
      const result = await plugin.inspect(projectPath, manifestFile);
      expect(result).toEqual(expectedTree);
    });
  });

  describe('with no target framework in project cli', () => {
    const projectPath = './test/fixtures/CoreNoTargetFrameworkInProj/';
    const manifestFile = 'obj/project.assets.json';
    const expectedTree = JSON.parse(
      fs.readFileSync(
        './test/fixtures/CoreNoTargetFrameworkInProj/expected.json',
        'utf-8',
      ),
    );

    it('parses correctly', async () => {
      const result = await plugin.inspect(projectPath, manifestFile);
      expect(result).toEqual(expectedTree);
    });
  });

  describe('with no project name in assets file', () => {
    const projectPath = './test/fixtures/CoreNoProjectNameInAssets/';
    const manifestFile = 'obj/project.assets.json';
    const expectedTree = JSON.parse(
      fs.readFileSync(
        './test/fixtures/CoreNoProjectNameInAssets/expected.json',
        'utf-8',
      ),
    );

    it('parse core without project name in project assets file with assets-project-name argument', async () => {
      const result = await plugin.inspect(projectPath, manifestFile, {
        'assets-project-name': true,
      });
      expect(result).toEqual(expectedTree);
    });

    it('parse core without project name in project assets file without assets-project-name argument', async () => {
      const result = await plugin.inspect(projectPath, manifestFile);
      expect(result).toEqual(expectedTree);
    });
  });

  describe('with project name in assets file', () => {
    const projectPath = './test/fixtures/CoreProjectNameInAssets/';
    const manifestFile = 'obj/project.assets.json';
    const expectedTreeWithAssetsProjectNameArgument = JSON.parse(
      fs.readFileSync(
        './test/fixtures/CoreProjectNameInAssets/expectedWithAssetsProjectNameArgument.json',
        'utf-8',
      ),
    );
    const expectedTreeWithoutAssetsProjectNameArgument = JSON.parse(
      fs.readFileSync(
        './test/fixtures/CoreProjectNameInAssets/expectedWithoutAssetsProjectNameArgument.json',
        'utf-8',
      ),
    );

    it('parse core with project name in project assets file with assets-project-name', async () => {
      const result = await plugin.inspect(projectPath, manifestFile, {
        'assets-project-name': true,
      });
      expect(result).toEqual(expectedTreeWithAssetsProjectNameArgument);
    });

    it('parse core with project name in project assets file without assets-project-name', async () => {
      const result = await plugin.inspect(projectPath, manifestFile);
      expect(result).toEqual(expectedTreeWithoutAssetsProjectNameArgument);
    });
  });
});
