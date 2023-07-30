import { describe, expect, it } from '@jest/globals';
import { parse } from '../../lib/nuget-parser/parsers/nuspec-parser';

describe('parseNuSpec ', () => {
  it('should not throw an error when there are no dependencies in the metadata', async () => {
    const nuspecWithoutMetadataDependencies =
      '<?xml version="1.0"?>\n' +
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
      '</package>';

    const parsedResult = await parse(
      nuspecWithoutMetadataDependencies,
      {
        original: '',
        framework: 'net',
        version: '472',
      },
      'dependencyName',
    );
    expect(parsedResult).toBeDefined();
    expect(parsedResult.children).toBeDefined();
    expect(parsedResult.name).toBeDefined();
  });

  it.each([
    {
      nuspec:
        ' <?xml version="1.0"?>\n' +
        '<package xmlns="http://schemas.microsoft.com/packaging/2010/07/nuspec.xsd">\n' +
        '</package>',
      description: 'there is no metadata',
    },
    {
      nuspec:
        '<?xml version="1.0"?>\n' +
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
        '</package>',
      description: 'the nuspec contains malformed XML',
    },
  ])('should throw an error when $description', async ({ nuspec }) => {
    await expect(
      parse(
        nuspec,
        {
          original: '',
          framework: 'net',
          version: '472',
        },
        'dependencyName',
      ),
    ).rejects.toThrow();
  });
});
