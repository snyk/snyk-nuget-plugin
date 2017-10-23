var test = require('tap').test;
var path = require('path');

var plugin = require('../lib/index');
var targetManifestFile = './test/stubs/_1_project.json';

function createEmptyNode(name, version, targetFramework) {
  var resolvedPath = path.resolve(
    __dirname,
    'packages',
    name + '.' + version);
  return {
    path: resolvedPath,
    name: name,
    version: version,
    targetFramework: targetFramework,
    dependencies: {},
  }
}

function buildExpectedTree(targetFile) {
  return {
    plugin: {
      name: 'NuGet',
      targetFile: targetFile,
    },
    package: {
      // name: projectRootFolder, (omitted because it cannot be tested)
      version: null,
      packageFormatVersion: 'Nuget:0.0.0',
      dependencies: {
        // jscs:disable
        'Microsoft.CodeDom.Providers.DotNetCompilerPlatform.1.0.0': createEmptyNode('Microsoft.CodeDom.Providers.DotNetCompilerPlatform', '1.0.0', null),
        'Microsoft.Net.Compilers.1.0.0': createEmptyNode('Microsoft.Net.Compilers', '1.0.0', null),
        'Microsoft.Web.Infrastructure.1.0.0.0': createEmptyNode('Microsoft.Web.Infrastructure', '1.0.0.0', null),
        'Microsoft.Web.Xdt.2.1.1': createEmptyNode('Microsoft.Web.Xdt', '2.1.1', null),
        'Newtonsoft.Json.8.0.3': createEmptyNode('Newtonsoft.Json', '8.0.3', null),
        'NuGet.Core.2.11.1': createEmptyNode('NuGet.Core', '2.11.1', null),
        'NuGet.Server.2.11.2': createEmptyNode('NuGet.Server', '2.11.2', null),
        'RouteMagic.1.3': createEmptyNode('RouteMagic', '1.3', null),
        'WebActivatorEx.2.1.0': createEmptyNode('WebActivatorEx', '2.1.0', null)
        // jscs:enable
      },
    },
    from: null,
  };
}

test('parse project.json file', function (t) {
  var expectedTree = buildExpectedTree(targetManifestFile);

  plugin.inspect(null, targetManifestFile, null)
  .then(function (result) {
    t.test('plugin', function (t) {
      delete result.package.name;
      t.deepEqual(expectedTree, result);
      t.end();
    });
    return result;
  })
  .then(function (result) {
    if (result) {
      t.end();
    }
  });
});

test('parse package.config file', function (t) {
  var expectedTree = buildExpectedTree(targetManifestFile);

  plugin.inspect(null, targetManifestFile, null)
  .then(function (result) {
    t.test('project.json', function (t) {
      delete result.package.name;
      t.deepEqual(expectedTree, result);
      t.end();
    });
    return result;
  })
  .then(function (result) {
    if (result) {
      t.end();
    }
  });
});
