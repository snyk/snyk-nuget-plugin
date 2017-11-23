var test = require('tap').test;
var fs = require('fs');

var plugin = require('../lib/index');
var stubProjectLocation = './test/stubs/dummy_project_1/';
var targetPackagesConfigFile =
  stubProjectLocation + 'dummy_project_1/packages.config';
var alternatePackagesFolder =
  stubProjectLocation + 'alternate_packages';
var targetCSProjFile =
  stubProjectLocation + 'dummy_project_1/WebApplication1.csproj';
var targetJSONManifest =
  './test/stubs/_2_project.json';
var targetJSONManifestData =
  require('./stubs/_2_project.json');


test('parse project.assets.json - like and traverse packages', function (t) {
  var expectedTreeFile =
  fs.readFileSync(
    stubProjectLocation + 'dummy_project_1/expected_csproj.json');
  var expectedTree = JSON.parse(expectedTreeFile.toString());
  // NUnit can be referenced in .nuspec files.
  // In this test the manifest file has no NUnit reference,
  // therefor it is not expected to be in the result.
  delete expectedTree.package.dependencies.NUnit;
  plugin.inspect(stubProjectLocation, targetJSONManifest, {
    packagesFolder: stubProjectLocation + '/packages',
  }).then(function (result) {
    // In case project details are included in manifest file,
    // it's expected to be included in the 'package' section
    t.equal(
      result.package.name,
      targetJSONManifestData.project.restore.projectName,
      'expects extraction of project\'s name from manifest');
    t.equal(
      result.package.version,
      targetJSONManifestData.project.version,
      'expects extraction of project\'s version from manifest');
    t.deepEqual(
      result.package.dependencies,
      expectedTree.package.dependencies,
      'expects dependency tree to be correct');
    t.ok(result.plugin);
    t.end();
  });
});


test('parse .csproj and traverse packages', function (t) {
  var expectedTreeFile =
    fs.readFileSync(
      stubProjectLocation + 'dummy_project_1/expected_csproj.json');
  var expectedTree = JSON.parse(expectedTreeFile.toString());

  plugin.inspect(null, targetCSProjFile, null)
  .then(function (result) {
    t.test('traversing', function (t) {
      t.deepEqual(
        result.package.dependencies,
        expectedTree.package.dependencies,
        'expects dependency tree to be correct');
      t.ok(result.plugin, 'plugin details exists in result');
      t.equal(result.plugin.name, 'snyk-nuget-plugin',
        'plugin\'s name is snyk-nuget-plugin');
      t.equal(result.plugin.targetFile, targetCSProjFile,
        'plugin shows correct targetFile');
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
    fs.readFileSync(
      stubProjectLocation + 'dummy_project_1/expected_pkgcfg.json');
  var expectedTree = JSON.parse(expectedTreeFile.toString());

  plugin.inspect(null, targetPackagesConfigFile, null)
  .then(function (result) {
    t.test('traversing', function (t) {
      t.deepEqual(
        result.package.dependencies,
        expectedTree.package.dependencies);
      t.ok(result.plugin);
      t.equal(result.plugin.name, 'snyk-nuget-plugin');
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

test('parse packages.config and traverse alternate packages folder',
  function (t) {
    var expectedTreeFile =
      fs.readFileSync(
        stubProjectLocation + 'dummy_project_1/expected_pkgcfg.json');
    var expectedTree = JSON.parse(expectedTreeFile.toString());

    plugin.inspect(null, targetPackagesConfigFile, {
      packagesFolder: alternatePackagesFolder,
    })
    .then(function (result) {
      t.test('traversing', function (t) {
        t.deepEqual(
          result.package.dependencies,
          expectedTree.package.dependencies);
        t.ok(result.plugin);
        t.equal(result.plugin.name, 'snyk-nuget-plugin');
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
