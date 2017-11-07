var test = require('tap').test;
var fs = require('fs');

var plugin = require('../lib/index');
var stubProjectLocation = './test/stubs/dummy_project_1/dummy_project_1/';
var targetPackagesConfigFile = stubProjectLocation + 'packages.config';
var targetCSProjFile = stubProjectLocation + 'WebApplication1.csproj';


test('parse .csproj and traverse packages', function (t) {
  var expectedTreeFile =
    fs.readFileSync(stubProjectLocation + 'expected_csproj.json');
  var expectedTree = JSON.parse(expectedTreeFile.toString());

  plugin.inspect(null, targetCSProjFile, null)
  .then(function (result) {
    t.test('traversing', function (t) {
      t.deepEqual(
        result.package.dependencies,
        expectedTree.package.dependencies);
      t.end();
    })
    return result;
  })
  .then(function (result) {
    if (result) {
      t.end();
    }
  })
});

test('parse packages.config and traverse packages', function (t) {
  var expectedTreeFile =
    fs.readFileSync(stubProjectLocation + 'expected_pkgcfg.json');
  var expectedTree = JSON.parse(expectedTreeFile.toString());

  plugin.inspect(null, targetPackagesConfigFile, null)
  .then(function (result) {
    t.test('traversing', function (t) {
      t.deepEqual(
        result.package.dependencies,
        expectedTree.package.dependencies);
      t.end();
    })
    return result;
  })
  .then(function (result) {
    if (result) {
      t.end();
    }
  })
});
