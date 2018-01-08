var debug = require('debug')('snyk');

function Dependency(name, version) {
  this.name = name;
  this.version = version;
  this.dependencies = {};
  this.versionSpec = 'unknown';
  this.from = [];
}

Dependency.prototype.cloneShallow = function () {
  // clone, without the dependencies
  var result = new Dependency(this.name, this.version);
  result.versionSpec = this.versionSpec;
  return result;
};

Dependency.extractFromDotVersionNotation = function (expression) {
  var versionRef = /(?=\S+)(?=\.{1})((\.\d+)+)/.exec(expression)[0];
  var name = expression.split(versionRef)[0];
  return {
    name: name,
    version: versionRef.slice(1),
  };
};

Dependency.from = {
  folderName: function (folderName) {
    debug('Extracting by folder name ' + folderName);
    var info = Dependency.extractFromDotVersionNotation(folderName);
    var result = new Dependency(
      info.name,
      info.version
    );
    return result;
  },
  packgesConfigEntry: function (manifest) {
    debug('Extracting by packages.config entry:' +
      ' name = ' + manifest.$.id +
      ' version = ' + manifest.$.version);
    var result = new Dependency(
      manifest.$.id,
      manifest.$.version);
    result.versionSpec = manifest.$.version;
    return result;
  },
};

module.exports = Dependency;