import { inspect } from '../lib';

it('should create dep tree for package encoded with utf8 with bom', async () => {
  const fixturePath = './test/stubs/packages-config-with-utf16-packages/';

  const output = await inspect(fixturePath, 'packages.config', {
    packagesFolder: fixturePath + '/packages',
  });

  expect(output).toEqual({
    package: {
      dependencies: {
        Antlr: {
          dependencies: {},
          name: 'Antlr',
          version: '3.4.1.9004',
        },
        'Microsoft.Web.Infrastructure': {
          dependencies: {},
          name: 'Microsoft.Web.Infrastructure',
          version: '1.0.0.0',
        },
        'Swagger.Net': {
          dependencies: {
            WebActivator: {
              dependencies: {},
              name: 'WebActivator',
              version: '1.5.1',
            },
          },
          name: 'Swagger.Net',
          version: '0.5.5',
        },
      },
      name: 'packages-config-with-utf16-packages',
      packageFormatVersion: 'nuget:0.0.0',
      version: '0.0.0',
    },
    plugin: {
      name: 'snyk-nuget-plugin',
      targetFile: 'packages.config',
      targetRuntime: 'net45',
    },
  });
});
