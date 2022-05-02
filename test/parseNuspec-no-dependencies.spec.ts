import { _parsedNuspec } from '../lib/nuget-parser/nuspec-parser';

import * as fs from 'fs';

import * as plugin from '../lib/index';


JSON.parse(fs.readFileSync('./test/stubs/_2_project.json', 'utf-8'));

const projects = {
  csproj: {
    projectPath: "./test/stubs/target_framework/no_csproj",
    manifestFile: "obj/project.assets.json",
    defaultName: "no_csproj",
  },

  packagesConfig: {
    projectPath: "./test/stubs/packages-config-only",
    manifestFile: "packages.config",
    defaultName: "packages-config-only",
  },
};

describe('parse-with-project-name-prefix', () => {
  for (const project in projects) {
    const proj = projects[project];
    it(`inspect ${project} with project-name-prefix option`, async () => {
      const res = await plugin.inspect(proj.projectPath, proj.manifestFile, {
        "project-name-prefix": "custom-prefix/",
      });
      expect(
        res.package.name).toEqual(`custom-prefix/${proj.defaultName}`);
    });
  }
});

describe('parseNuSpec ', () => {
  const nuspecWithoutMetadataDependencies = '<?xml version="1.0"?>\n' +
    '<package xmlns="http://schemas.microsoft.com/packaging/2010/07/nuspec.xsd">\n' +
    '  <metadata>\n' +
    '    <id>jQuery</id>\n' +
    '    <version>3.2.1</version>\n' +
    '    <title>jQuery</title>\n' +
    '    <authors>jQuery Foundation, Inc.</authors>\n' +
    '    <owners>jQuery Foundation, Inc.</owners>\n' +
    '    <licenseUrl>http://jquery.org/license</licenseUrl>\n' +
    '    <projectUrl>http://jquery.com/</projectUrl>\n' +
    '    <requireLicenseAcceptance>false</requireLicenseAcceptance>\n' +
    '    <description>jQuery is a new kind of JavaScript Library.\n' +
    '        jQuery is a fast and concise JavaScript Library that simplifies HTML document traversing, event handling, animating, and Ajax interactions for rapid web development. jQuery is designed to change the way that you write JavaScript.\n' +
    '        NOTE: This package is maintained on behalf of the library owners by the NuGet Community Packages project at http://nugetpackages.codeplex.com/</description>\n' +
    '    <language>en-US</language>\n' +
    '    <tags>jQuery</tags>\n' +
    '  </metadata>\n' +
    '</package>'

  const nuspecWithoutMetadata = ' <?xml version="1.0"?>\n' +
    '<package xmlns="http://schemas.microsoft.com/packaging/2010/07/nuspec.xsd">\n' +
    '</package>'

  const nuspecWithMalformedTag = '<?xml version="1.0"?>\n' +
    '<package xmlns="http://schemas.microsoft.com/packaging/2010/07/nuspec.xsd">\n' +
    '<metadata123>\n' +
  '    <id>jQuery</id>\n' +
  '    <version>3.2.1</version>\n' +
  '    <title>jQuery</title>\n' +
  '    <authors>jQuery Foundation, Inc.</authors>\n' +
  '    <owners>jQuery Foundation, Inc.</owners>\n' +
  '    <licenseUrl>http://jquery.org/license</licenseUrl>\n' +
  '    <projectUrl>http://jquery.com/</projectUrl>\n' +
  '    <requireLicenseAcceptance>false</requireLicenseAcceptance>\n' +
  '    <description>jQuery is a new kind of JavaScript Library.\n' +
  '        jQuery is a fast and concise JavaScript Library that simplifies HTML document traversing, event handling, animating, and Ajax interactions for rapid web development. jQuery is designed to change the way that you write JavaScript.\n' +
  '        NOTE: This package is maintained on behalf of the library owners by the NuGet Community Packages project at http://nugetpackages.codeplex.com/</description>\n' +
  '    <language>en-US</language>\n' +
  '    <tags>jQuery</tags>\n' +
  '  </metadata>\n' +
    '</package>'
  
  it('should not throw an error when there are no dependencies in the metadata', async () => {
    const parsedResult = await _parsedNuspec(nuspecWithoutMetadataDependencies, {
      original: '',
      framework: 'net',
      version: '472'
    }, 'dependencyName')
    expect(parsedResult).toBeDefined();
    expect(parsedResult.children).toBeDefined();
    expect(parsedResult.name).toBeDefined();

  });


  it('should throw an error when there is no metadata', async () => {
    await expect(_parsedNuspec(nuspecWithoutMetadata, {original: '', framework: 'net',
      version: '472'},'dependencyName')).rejects.toThrow();
  });

  it('should throw an error when the nuspec contains malformed XML', async () => {
    await expect(_parsedNuspec(nuspecWithMalformedTag, {original: '',framework: 'net',
      version: '472'},'dependencyName')).rejects.toThrow();
  });

});
