var parser = require('./lib');
var fs = require('fs');

function getFlag(flag) {
  var index = process.argv.indexOf('--' + flag);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1];
}

var targetFile = getFlag('name');

if (!targetFile) {
  console.error('No target file specified');
  process.exit(1);
}

parser
  .inspect(null, targetFile, null)
  .then(function (result) {
    if (!result) {
      console.log('Error parsing ' + targetFile);
      process.exit(1);
    }
    console.log(JSON.stringify(result, '', 2));
    process.exit(0);
  });