var debug = require('debug')('snyk');
var childProcess = require('child_process');

var isWindows = /^win/.test(process.platform);

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
  csprojEntry: function (referenceItem) {
    var hintPath = referenceItem.HintPath[0];
    var result;
    var version;
    var name;

    if (isWindows) {
      try {
        // try execute powershell to extract version from .dll file
        var command = '(Get-Item ${file}).VersionInfo.ProductVersion'
          .split('${file}').join(hintPath);
        console.log('Analyzing ' + hintPath)
        version = childProcess.execSync('powershell.exe ' + command, {
          stdio: ['pipe', 'pipe', 'ignore'],
        }).toString();

        // on some NT machines stderr of powershell will returned as stdout
        // the error will start in 'Get'
        // expected results should be a.b, a.b.c, a.b.c.d or a.b.c-suffix
        var isValidVersion = version.indexOf('Get') !== 0
        && /(\d+\.)(\d+\.*)(\d+)*/.test(version);
        if (!isValidVersion) {
          throw new Error('Failed to extract version - returned value: '
          + version);
        }

        // cleanup powershell return string (crlf and dashes)
        version = version
          .split('\r').join('').split('\n').join()
          .split('-').join('.')
          .split(',').join('');
        // cleanup revision number - take only a.b.c (or a.b)
        version = version.split('.').slice(0, 3).join('.');

        // cleanup name. Some references use the confusing format:
        // <ReferenceItem Include="Library.Name, version=x.y.z" ... />
        // cleaning up if exists
        name = referenceItem.$.Include;
        if (name.indexOf(',')) {
          name = name.split(',')[0];
        }

        result = new Dependency(name, version);
        return result;
      }
      catch (err) {
        debug('Powershell failure ' + err);
      }
    }
    // This is the fallback routine, if running on non-windows or
    // powershell not available or failed to extract version

    // separator can be windows or posix, regardless of the machine
    var sep = (
      /\//.exec(referenceItem.HintPath[0]) ||
      /\\/.exec(referenceItem.HintPath[0]))[0];

    // attempt extracting from HintPath
    var depLocalPath = referenceItem.HintPath[0]
      .split(sep).slice(2,3).join(sep);

    var packageInfo = Dependency.extractFromDotVersionNotation(depLocalPath);
    result = new Dependency(packageInfo.name, packageInfo.version);
    return result;
  },
};

module.exports = Dependency;