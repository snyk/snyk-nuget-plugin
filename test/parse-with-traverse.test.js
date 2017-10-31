var test = require('tap').test;
var path = require('path');
var fs = require('fs');

var plugin = require('../lib/index');
var stubProjectLocation = './test/stubs/dummy_project_1/dummy_project_1/';
var targetFile = stubProjectLocation + 'packages.config';

test('parse packages.config and traverse packages', function (t) {
  var expectedTreeFile = fs.readFileSync(stubProjectLocation + 'expected.json');
  var expectedTree = JSON.parse(expectedTreeFile.toString());

  plugin.inspect(null, targetFile, null)
  .then(function (result) {
    t.test('traversing', function (t) {
      expectedTree.name = result.name; // ignore local filesystem project path
      t.deepEqual(result, expectedTree);
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
