import { describe, expect, it } from '@jest/globals';

import * as plugin from '../../lib';

const targetProjectJsonPath = './test/stubs';
const targetProjectJsonFile = '_1_project.json';

function createEmptyNode(name, version) {
  return {
    dependencies: {},
    name,
    version,
  };
}

function buildExpectedTree() {
  return {
    dependencies: {
      // jscs:disable
      'Microsoft.CodeDom.Providers.DotNetCompilerPlatform': createEmptyNode(
        'Microsoft.CodeDom.Providers.DotNetCompilerPlatform',
        '1.0.0',
      ),
      'Microsoft.Net.Compilers': createEmptyNode(
        'Microsoft.Net.Compilers',
        '1.0.0',
      ),
      'Microsoft.Web.Infrastructure': createEmptyNode(
        'Microsoft.Web.Infrastructure',
        '1.0.0.0',
      ),
      'Microsoft.Web.Xdt': createEmptyNode('Microsoft.Web.Xdt', '2.1.1'),
      'Newtonsoft.Json': createEmptyNode('Newtonsoft.Json', '8.0.3'),
      'NuGet.Core': createEmptyNode('NuGet.Core', '2.11.1'),
      'NuGet.Server': createEmptyNode('NuGet.Server', '2.11.2'),
      RouteMagic: createEmptyNode('RouteMagic', '1.3'),
      WebActivatorEx: createEmptyNode('WebActivatorEx', '2.1.0'),
      // jscs:enable
    },
  };
}

describe('when parsing without traverse', () => {
  it('parse project.json file', async () => {
    const expectedTree = buildExpectedTree();
    const result = await plugin.inspect(
      targetProjectJsonPath,
      targetProjectJsonFile,
      null,
    );
    expect(result.package.dependencies).toEqual(expectedTree.dependencies);
    expect(result.plugin).toBeTruthy();
    expect(result.plugin.name).toBe('snyk-nuget-plugin');
  });
});
