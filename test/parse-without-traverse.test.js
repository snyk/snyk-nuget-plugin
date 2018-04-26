var test = require('tap').test;
var path = require('path');

var plugin = require('../lib/index');
var targetProjectJsonPath = './test/stubs';
var targetProjectJsonFile = '_1_project.json';

function createEmptyNode(name, version) {
  var resolvedPath = path.resolve(
    __dirname,
    'packages',
    name + '.' + version);
  return {
    name: name,
    version: version,
    dependencies: {},
  };
}

function buildExpectedTree() {
  return {
    dependencies: {
      // jscs:disable
      'Microsoft.CodeDom.Providers.DotNetCompilerPlatform': createEmptyNode('Microsoft.CodeDom.Providers.DotNetCompilerPlatform', '1.0.0', null),
      'Microsoft.Net.Compilers': createEmptyNode('Microsoft.Net.Compilers', '1.0.0', null),
      'Microsoft.Web.Infrastructure': createEmptyNode('Microsoft.Web.Infrastructure', '1.0.0.0', null),
      'Microsoft.Web.Xdt': createEmptyNode('Microsoft.Web.Xdt', '2.1.1', null),
      'Newtonsoft.Json': createEmptyNode('Newtonsoft.Json', '8.0.3', null),
      'NuGet.Core': createEmptyNode('NuGet.Core', '2.11.1', null),
      'NuGet.Server': createEmptyNode('NuGet.Server', '2.11.2', null),
      'RouteMagic': createEmptyNode('RouteMagic', '1.3', null),
      'WebActivatorEx': createEmptyNode('WebActivatorEx', '2.1.0', null)
      // jscs:enable
    },
  };
}

test('parse project.json file', function (t) {
  var expectedTree = buildExpectedTree();

  plugin.inspect(targetProjectJsonPath, targetProjectJsonFile, null)
  .then(function (result) {
    t.test('plugin', function (t) {
      t.deepEqual(result.package.dependencies, expectedTree.dependencies);
      t.ok(result.plugin);
      t.equal(result.plugin.name, 'snyk-nuget-plugin');
      t.end();
    });
    return result;
  })
  .then(function (result) {
    if (result) {
      t.end();
    }
  })
  .catch(function (err) {
    t.fail(err);
  })
});
