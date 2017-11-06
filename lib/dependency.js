function Dependency(name, version, targetFramework) {
  this.name = name;
  this.version = version;
  this.targetFramework = targetFramework;
  this.dependencies = {};
  this.versionSpec = 'unknown';
  this.from = [];
}

Dependency.prototype.cloneShallow = function () {
  // clone, without the dependencies
  var result = new Dependency(this.name, this.version, this.targetFramework);
  result.versionSpec = this.versionSpec;
  return result;
};

Dependency.from = {
  packgesConfigEntry: function (manifest) {
    var result = new Dependency(
      manifest.$.id,
      manifest.$.version,
      manifest.$.targetFramework);
    result.versionSpec = manifest.$.version;
    return result;
  },
};

module.exports = Dependency;