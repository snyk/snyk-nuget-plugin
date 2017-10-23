function Dependency(name, version, targetFramework) {
  this.name = name;
  this.version = version;
  this.targetFramework = targetFramework;
  this.dependencies = {};
  this.path = '';
}

Object.defineProperty(Dependency.prototype, 'resolvedName', {
  get: function () {
    return this.name + '.' + this.version;
  },
})

/**
* @argument {Dependency} dep
*/
Dependency.prototype.addDependecy = function addDependecy(dep) {
  this.flatDependencyMap[dep.name] =
    this.flatDependencyMap[dep.name] ||
    new Dependency(dep.name, dep.version, dep.targetFramework);
  this.dependencies.push(dep);
};

/**
* @argument {string} name
*/
Dependency.prototype.hasDependency = function hasDependency(name) {
  return this.flatDependencyMap[name] !== undefined;
};

module.exports = Dependency;