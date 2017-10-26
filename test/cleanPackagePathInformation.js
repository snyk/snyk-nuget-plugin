/*

Clean path from package information is required during testing
as the test environment's folders differ from one to another
path shows full path information relative to the machine filesystem
therefor should be omitted during tests

*/
module.exports = function cleanPathInformation(node) {
  if (node.path) {
    node.path = '';
  }
  if (node.fileName) {
    node.fileName = '';
  }
  if (node.dependencies) {
    for (var depName in node.dependencies) {
      node.dependencies[depName] =
      cleanPathInformation(node.dependencies[depName]);
    }
  }
  return node;
}
