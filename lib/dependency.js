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
  csprojEntry: function (referenceItem) {
    var sep = (
      /\//.exec(referenceItem.HintPath[0]) ||
      /\\/.exec(referenceItem.HintPath[0]))[0];
    var depLocalPath = referenceItem.HintPath[0]
      .split(sep).slice(2,3).join(sep);
    var versionRef = /(?=\S+)(?=\.{1})((\.\d+)+)/.exec(depLocalPath)[0];
    var name = depLocalPath.split(versionRef)[0];
    var version = versionRef.slice(1);
    var result = new Dependency(
      name,
      version,
      'unknown'
    );
    return result;
  },
};

module.exports = Dependency;