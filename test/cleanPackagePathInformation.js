/*

Clean path from package information is required during testing
as the test environment's folders differ from one to another
path shows full path information relative to the machine filesystem
therefor should be omitted during tests

*/

var extend = require('util')._extend;

function cleanPathInformation(node) {
  if (node.path) {
    node.path = 'X';
  }
  if (node.fileName) {
    node.fileName = 'X';
  }
  if (node.dependencies) {
    for (var depName in node.dependencies) {
      node.dependencies[depName] =
        cleanPathInformation(node.dependencies[depName]);
    }
  }
  return node;
}

function cleanTreeFromLocalPathInformation(tree) {
  var result = extend(tree, {});
  result.package = cleanPathInformation(result.package);
  result.package.name = 'X';
  return result;
}

module.exports = cleanTreeFromLocalPathInformation;
