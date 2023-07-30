import { describe, expect, it } from '@jest/globals';
import { parse } from '../../lib/nuget-parser/parsers/dotnet-core-parser';

const duplicationNumber = 25;

function createDepTreeRecursive(rootDepName, targetsObject, remainingLevels) {
  if (remainingLevels < 1) return;

  targetsObject['.NETCoreApp,Version=v2.0'][rootDepName] = {
    type: 'package',
    dependencies: {},
  };
  for (let i = 0; i < duplicationNumber; i++) {
    targetsObject['.NETCoreApp,Version=v2.0'][rootDepName].dependencies[
      `generated_level_${remainingLevels}_dep_num_${i}`
    ] = '1.0.0';
    createDepTreeRecursive(
      `generated_level_${remainingLevels}_dep_num_${i}/1.0.0`,
      targetsObject,
      remainingLevels - 1,
    );
  }
}

describe('parse large dependency tree', () => {
  it('should parse tree when there is large dependencies tree', async () => {
    const tree = {
      dependencies: {},
      meta: {},
      name: 'custom-prefix/no-csproj',
      packageFormatVersion: 'nuget:0.0.0',
      version: '0.0.0',
    };

    const manifest = {
      version: 2,
      targets: {
        '.NETCoreApp,Version=v2.0': {
          'jQuery/1.10.2': {
            type: 'package',
            dependencies: {},
          },
          'Libuv/1.10.0': {
            type: 'package',
            dependencies: {
              'Microsoft.NETCore.Platforms': '1.0.1',
            },
            runtimeTargets: {
              'runtimes/linux-arm/native/libuv.so': {
                assetType: 'native',
                rid: 'linux-arm',
              },
              'runtimes/linux-arm64/native/libuv.so': {
                assetType: 'native',
                rid: 'linux-arm64',
              },
              'runtimes/linux-armel/native/libuv.so': {
                assetType: 'native',
                rid: 'linux-armel',
              },
              'runtimes/linux-x64/native/libuv.so': {
                assetType: 'native',
                rid: 'linux-x64',
              },
              'runtimes/osx/native/libuv.dylib': {
                assetType: 'native',
                rid: 'osx',
              },
              'runtimes/win-arm/native/libuv.dll': {
                assetType: 'native',
                rid: 'win-arm',
              },
              'runtimes/win-x64/native/libuv.dll': {
                assetType: 'native',
                rid: 'win-x64',
              },
              'runtimes/win-x86/native/libuv.dll': {
                assetType: 'native',
                rid: 'win-x86',
              },
            },
          },
          'Newtonsoft.Json/10.0.1': {
            type: 'package',
            dependencies: {
              'Microsoft.CSharp': '4.3.0',
              'System.Collections': '4.3.0',
              'System.ComponentModel.TypeConverter': '4.3.0',
              'System.Diagnostics.Debug': '4.3.0',
              'System.Dynamic.Runtime': '4.3.0',
              'System.Globalization': '4.3.0',
              'System.IO': '4.3.0',
              'System.Linq': '4.3.0',
              'System.Linq.Expressions': '4.3.0',
              'System.ObjectModel': '4.3.0',
              'System.Reflection': '4.3.0',
              'System.Reflection.Extensions': '4.3.0',
              'System.Resources.ResourceManager': '4.3.0',
              'System.Runtime': '4.3.0',
              'System.Runtime.Extensions': '4.3.0',
              'System.Runtime.Numerics': '4.3.0',
              'System.Runtime.Serialization.Formatters': '4.3.0',
              'System.Runtime.Serialization.Primitives': '4.3.0',
              'System.Text.Encoding': '4.3.0',
              'System.Text.Encoding.Extensions': '4.3.0',
              'System.Text.RegularExpressions': '4.3.0',
              'System.Threading': '4.3.0',
              'System.Threading.Tasks': '4.3.0',
              'System.Xml.ReaderWriter': '4.3.0',
              'System.Xml.XDocument': '4.3.0',
              'System.Xml.XmlDocument': '4.3.0',
            },
            compile: {
              'lib/netstandard1.3/Newtonsoft.Json.dll': {},
            },
            runtime: {
              'lib/netstandard1.3/Newtonsoft.Json.dll': {},
            },
          },
          'Newtonsoft.Json.Bson/1.0.1': {
            type: 'package',
            dependencies: {
              'NETStandard.Library': '1.6.1',
              'Newtonsoft.Json': '10.0.1',
            },
            compile: {
              'lib/netstandard1.3/Newtonsoft.Json.Bson.dll': {},
            },
            runtime: {
              'lib/netstandard1.3/Newtonsoft.Json.Bson.dll': {},
            },
          },
        },
      },
      libraries: {
        'Microsoft.Extensions.Logging.TraceSource/2.0.0': {
          sha512:
            'lbNYFjLU4RJvhYtO5jLa+d+T8OC495SkSfXFwFDeR9qtFqhrrCHe8Htjx4wR8HmFqugaJ2Yhzw9AqdvZbEy3Eg==',
          type: 'package',
          path: 'microsoft.extensions.logging.tracesource/2.0.0',
          files: [
            'lib/netstandard2.0/Microsoft.Extensions.Logging.TraceSource.dll',
            'lib/netstandard2.0/Microsoft.Extensions.Logging.TraceSource.xml',
            'microsoft.extensions.logging.tracesource.2.0.0.nupkg.sha512',
            'microsoft.extensions.logging.tracesource.nuspec',
          ],
        },
      },
      projectFileDependencyGroups: {
        '.NETCoreApp,Version=v2.0': [
          'Microsoft.AspNetCore.All >= 2.0.0',
          'Microsoft.NETCore.App >= 2.0.0',
          'NUnit.Runners >= 3.7.0',
          'jquery >= 1.10.2',
        ],
      },
      packageFolders: {
        '/home/aryeh/.nuget/packages/': {},
      },
      project: {
        version: '1.0.0',
        restore: {
          projectUniqueName:
            '/home/aryeh/.workspace/snyk-workspace/nuget/dotnet_cmd_linux_web/dotnet_cmd_linux_web.csproj',
          projectName: 'dotnet_cmd_linux_web',
          projectPath:
            '/home/aryeh/.workspace/snyk-workspace/nuget/dotnet_cmd_linux_web/dotnet_cmd_linux_web.csproj',
          outputPath:
            '/home/aryeh/.workspace/snyk-workspace/nuget/dotnet_cmd_linux_web/obj',
          projectStyle: 'PackageReference',
          originalTargetFrameworks: ['netcoreapp2.0'],
          frameworks: {
            'netcoreapp2.0': {
              projectReferences: {},
            },
          },
        },
        frameworks: {
          'netcoreapp2.0': {
            dependencies: {
              'Microsoft.NETCore.App': {
                target: 'Package',
                version: '2.0',
              },
              jquery: {
                target: 'Package',
                version: '1.10.2',
              },
              'Microsoft.AspNetCore.All': {
                target: 'Package',
                version: '2.0.0',
              },
              'NUnit.Runners': {
                target: 'Package',
                version: '3.7.0',
              },
            },
            imports: ['net461'],
          },
        },
        runtimes: {
          win: {
            '#import': [],
          },
          'win-x64': {
            '#import': [],
          },
          'win-x86': {
            '#import': [],
          },
        },
      },
    };

    // create the first 1000 root nodes
    const rootDepNum = 1000;
    for (let i = 0; i < rootDepNum; i++) {
      manifest.targets['.NETCoreApp,Version=v2.0'][
        'jQuery/1.10.2'
      ].dependencies[`generated_root_dep_num_${i}`] = '1.0.0';
    }

    // create dependencies for each level, up to 3 level dep tree
    const remainingLevel = 3;
    Object.keys(
      manifest.targets['.NETCoreApp,Version=v2.0']['jQuery/1.10.2']
        .dependencies,
    ).forEach(key => {
      createDepTreeRecursive(`${key}/1.0.0`, manifest.targets, remainingLevel);
    });

    const result = await parse(tree, manifest);

    expect(Object.keys(result.dependencies.jquery.dependencies).length).toBe(
      rootDepNum,
    );
    expect(
      Object.keys(
        result.dependencies.jquery.dependencies['generated_root_dep_num_0']
          .dependencies,
      ).length,
    ).toBe(duplicationNumber);
  });
});
