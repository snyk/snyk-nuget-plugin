import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as plugin from '../../lib';
import * as dotnet from '../../lib/nuget-parser/cli/dotnet';
import { legacyPlugin as pluginApi } from '@snyk/cli-interface';
import { FILTERED_DEPENDENCY_PREFIX } from '../../lib/nuget-parser/parsers/dotnet-core-v2-parser';

const ISWINDOWS = process.platform === 'win32';

/**
 * Helper function to run code from within a project directory.
 * This simulates real-world Snyk CLI usage where commands run from the project directory,
 * ensuring that global.json and other project-level files are respected.
 */
async function runInProjectDir<T>(
  projectPath: string,
  fn: (absolutePath: string) => Promise<T>,
): Promise<T> {
  const originalCwd = process.cwd();
  const absoluteProjectPath = path.resolve(originalCwd, projectPath);

  try {
    process.chdir(absoluteProjectPath);
    return await fn(absoluteProjectPath);
  } finally {
    process.chdir(originalCwd);
  }
}

describe('when generating depGraphs and runtime assemblies using the v2 parser', () => {
  const dotnetCoreProjectList = [
    {
      description: 'parse dotnet 6.0',
      projectPath: './test/fixtures/dotnetcore/dotnet_6',
      projectFile: 'dotnet_6.csproj',
      targetFramework: undefined,
      manifestFilePath: 'obj/project.assets.json',
    },
    {
      description: 'parse dotnet 6.0 and 7.0 but specify a targetFramework',
      projectPath: './test/fixtures/dotnetcore/dotnet_6_and_7',
      projectFile: 'dotnet_6_and_7.csproj',
      targetFramework: 'net7.0',
      manifestFilePath: 'obj/project.assets.json',
    },
    {
      description:
        'parse dotnet 6.0 with a local PackageReference to another local project',
      projectPath:
        './test/fixtures/dotnetcore/dotnet_6_local_package_reference/proj1',
      projectFile: 'proj1.csproj',
      targetFramework: 'net6.0',
      manifestFilePath: 'obj/project.assets.json',
    },
    {
      description: 'parse dotnet 7.0 when using Directory.Build.props',
      projectPath: './test/fixtures/props/build-props/App',
      projectFile: 'App.csproj',
      targetFramework: undefined,
      manifestFilePath: 'obj/project.assets.json',
    },
    {
      description: 'parse dotnet 6.0 that does not specify a runtimeIdentifier',
      projectPath: './test/fixtures/dotnetcore/dotnet_6_no_rid',
      projectFile: 'dotnet_6.csproj',
      targetFramework: undefined,
      manifestFilePath: 'obj/project.assets.json',
    },
    {
      description: 'parse dotnet 8.0',
      projectPath: './test/fixtures/dotnetcore/dotnet_8',
      projectFile: 'dotnet_8.csproj',
      targetFramework: undefined,
      manifestFilePath: 'obj/project.assets.json',
    },
    {
      description: 'parse dotnet 8.0 with <IsPublishable> turned to false',
      projectPath: './test/fixtures/dotnetcore/dotnet_8_is_not_publishable',
      projectFile: 'dotnet_8.csproj',
      targetFramework: undefined,
      manifestFilePath: 'obj/project.assets.json',
    },
    {
      description: 'parse dotnet 8.0 with custom project and output path',
      projectPath:
        './test/fixtures/dotnetcore/dotnet_8_custom_project_and_output_path/nested_csproj',
      projectFile: 'dotnet_8.csproj',
      targetFramework: undefined,
      manifestFilePath: '../dist/company/nested_csproj/obj/project.assets.json',
    },
    {
      description: 'parse netstandard 2.1 project',
      projectPath: './test/fixtures/dotnetcore/netstandard21',
      projectFile: 'netstandard21.csproj',
      targetFramework: undefined,
      manifestFilePath: 'obj/project.assets.json',
    },
    {
      description:
        'dotnet project that includes azure functions putting deps file in a /bin subdirectory',
      projectPath: './test/fixtures/dotnetcore/dotnet_8_with_azure_functions',
      projectFile: 'dotnet_8_with_azure_functions.csproj',
      targetFramework: undefined,
      manifestFilePath: 'obj/project.assets.json',
    },
    {
      description:
        'dotnet project with multiple .csproj files in the same folder',
      projectPath:
        './test/fixtures/dotnetcore/dotnet_8_multiple_projects_same_folder',
      projectFile: 'dotnet_8_first.csproj',
      targetFramework: 'net8.0',
      manifestFilePath: 'obj/project.assets.json',
    },
    {
      description: 'dotnet project with whitespaces in paths',
      projectPath: './test/fixtures/dotnetcore/dotnet_8 with spaces in path',
      projectFile: 'dotnet 8.csproj',
      targetFramework: 'net8.0',
      manifestFilePath: 'obj/project.assets.json',
    },
    {
      description:
        'parse dotnet 8.0 with a local PackageReference to the root project',
      projectPath:
        './test/fixtures/dotnetcore/dotnet_8_local_package_reference/SecondaryProj',
      projectFile: 'SecondaryProj.csproj',
      targetFramework: 'net8.0',
      manifestFilePath: 'obj/project.assets.json',
    },
    {
      description: 'parse dotnet 8.0 with PublishSingleFile turned on',
      projectPath: './test/fixtures/dotnetcore/dotnet_8_publish_single_file',
      projectFile: 'dotnet_8_publish_single_file.csproj',
      targetFramework: 'net8.0',
      manifestFilePath: 'obj/project.assets.json',
    },
    {
      description:
        'parse dotnet 8.0 with TreatWarningsAsErrors and WarningsAsErrors',
      projectPath:
        './test/fixtures/dotnetcore/dotnet_8_treat_warnings_as_errors',
      projectFile: 'dotnet_8_treat_warnings_as_errors.csproj',
      targetFramework: 'net8.0',
      manifestFilePath: 'obj/project.assets.json',
    },
    {
      description: 'parse dotnet 8.0 with SnykTest publish property',
      projectPath:
        './test/fixtures/dotnetcore/dotnet_8_with_snyk_test_property',
      projectFile: 'dotnet_8_with_snyk_test_property.csproj',
      targetFramework: 'net8.0',
      manifestFilePath: 'obj/project.assets.json',
    },
    {
      description: 'parse dotnet 8.0 different project name',
      projectPath: './test/fixtures/dotnetcore/dotnet_8_different_project_name',
      projectFile: 'dotnet_8_foo.csproj',
      targetFramework: 'net8.0',
      manifestFilePath: 'obj/project.assets.json',
    },
    {
      description: 'parse dotnet 8.0 with snyk name',
      projectPath:
        './test/fixtures/dotnetcore/dotnet_8_with_package_id_property',
      projectFile: 'dotnet_8_with_package_id_property.csproj',
      targetFramework: 'net8.0',
      manifestFilePath: 'obj/project.assets.json',
      projectNamePrefix: 'prefix_',
    },
    {
      description: 'parse dotnet 8.0 false positive',
      projectPath:
        './test/fixtures/dotnetcore/dotnet_8_false_positive/FirstProject',
      projectFile: 'dotnet_8_false_positive.csproj',
      targetFramework: 'net8.0',
      manifestFilePath: 'obj/project.assets.json',
    },
    {
      description: 'parse dotnet 8.0 transitive false positive',
      projectPath:
        './test/fixtures/dotnetcore/dotnet_8_transitive_false_positive/FirstProject',
      projectFile: 'dotnet_8_transitive_false_positive.csproj',
      targetFramework: 'net8.0',
      manifestFilePath: 'obj/project.assets.json',
    },
    {
      description: 'parse dotnet 8.0 windows targeting',
      projectPath: './test/fixtures/dotnetcore/dotnet-8-windows-targeting',
      projectFile: 'dotnet_8_windows_targeting.csproj',
      targetFramework: 'net8.0-windows',
      manifestFilePath: 'obj/project.assets.json',
    },
    {
      description:
        'parse dotnet 8.0 multiple publish output files with the same relative path',
      projectPath:
        './test/fixtures/dotnetcore/dotnet_8_duplicate_publish_output_files/FirstProject',
      projectFile: 'dotnet_8_duplicate_publish_output.csproj',
      targetFramework: 'net8.0',
      manifestFilePath: 'obj/project.assets.json',
    },
    {
      description:
        'parse dotnet 6.0 with specific windows build number net6.0-windows10.0.19041.0',
      projectPath: './test/fixtures/dotnetcore/dotnet_6_specific_windows_build',
      projectFile: 'dotnet_6_specific_windows_build.csproj',
      targetFramework: 'net6.0-windows10.0.19041.0',
      manifestFilePath: 'obj/project.assets.json',
    },
  ];

  it.each(dotnetCoreProjectList)(
    'succeeds given a project file and returns a single dependency graph for single-targetFramework projects: $description',
    async ({
      projectPath,
      projectFile,
      manifestFilePath,
      targetFramework,
      projectNamePrefix,
    }) => {
      await runInProjectDir(projectPath, async (absoluteProjectPath) => {
        // Run a dotnet restore beforehand, in order to be able to supply a project.assets.json file
        await dotnet.restore(path.resolve(projectFile));

        const result = await plugin.inspect(
          absoluteProjectPath,
          manifestFilePath,
          {
            'dotnet-runtime-resolution': true,
            'dotnet-target-framework': targetFramework,
            ...(projectNamePrefix
              ? { 'project-name-prefix': projectNamePrefix }
              : {}),
          },
        );

        if (!pluginApi.isMultiResult(result)) {
          throw new Error('expected a multiResult response from inspection');
        }

        expect(result.scannedProjects.length).toEqual(1);

        const expectedGraph = JSON.parse(
          fs.readFileSync(path.resolve('expected_depgraph.json'), 'utf-8'),
        );
        expect(result.scannedProjects[0].depGraph?.toJSON()).toEqual(
          expectedGraph.depGraph,
        );
      });
    },
    100000,
  );

  it.each(dotnetCoreProjectList)(
    'succeeds given a project file and returns a single dependency graph for single-targetFramework projects: $description - FP FF on',
    async ({
      projectPath,
      projectFile,
      manifestFilePath,
      targetFramework,
      projectNamePrefix,
    }) => {
      await runInProjectDir(projectPath, async (absoluteProjectPath) => {
        // Run a dotnet restore beforehand, in order to be able to supply a project.assets.json file
        await dotnet.restore(path.resolve(projectFile));

        const result = await plugin.inspect(
          absoluteProjectPath,
          manifestFilePath,
          {
            'dotnet-runtime-resolution': true,
            'dotnet-target-framework': targetFramework,
            useFixForImprovedDotnetFalsePositives: true,
            ...(projectNamePrefix
              ? { 'project-name-prefix': projectNamePrefix }
              : {}),
          },
        );

        if (!pluginApi.isMultiResult(result)) {
          throw new Error('expected a multiResult response from inspection');
        }

        expect(result.scannedProjects.length).toEqual(1);

        const expectedGraph = JSON.parse(
          fs.readFileSync(path.resolve('expected_depgraph-v2.json'), 'utf-8'),
        );
        expect(result.scannedProjects[0].depGraph?.toJSON()).toEqual(
          expectedGraph.depGraph,
        );
      });
    },
    100000,
  );

  it.each([
    ...dotnetCoreProjectList,
    {
      description: 'parse Godot project with custom BaseIntermediateOutputPath',
      projectPath: './test/fixtures/dotnetcore/godot_custom_output_path',
      projectFile: 'godot_custom_output_path.csproj',
      targetFramework: 'net8.0',
      manifestFilePath: 'obj/project.assets.json', // Will be resolved to build/intermediate/project.assets.json
    },
    {
      description:
        'parse .NET 9.0 project with custom BaseIntermediateOutputPath',
      projectPath:
        './test/fixtures/dotnetcore/dotnet_9_custom_intermediate_path',
      projectFile: 'dotnet_9_custom_intermediate_path.csproj',
      targetFramework: 'net9.0',
      manifestFilePath: 'obj/project.assets.json', // Will be resolved to obj/build/intermediate/project.assets.json
    },
    {
      description: 'parse .NET 8.0 project with transitive pinned version',
      projectPath:
        './test/fixtures/dotnetcore/dotnet_8_transitive_pinned_version',
      projectFile: 'dotnet_8_transitive_pinned_version.csproj',
      targetFramework: 'net8.0',
      manifestFilePath: 'obj/project.assets.json',
    },
    {
      description: 'parse netstandard without overriding runtime assemblies',
      projectPath:
        './test/fixtures/dotnetcore/netstandard21_no_assemply_overrides',
      projectFile: 'netstandard21_no_assemply_overrides.csproj',
      targetFramework: 'netstandard2.1',
      manifestFilePath: 'obj/project.assets.json',
    },
    {
      description: 'parse dotnet netcoreapp3.1',
      projectPath: './test/fixtures/dotnetcore/netcoreapp31',
      projectFile: 'dotnet_2.csproj',
      targetFramework: undefined,
      manifestFilePath: 'obj/project.assets.json',
    },
    {
      description: 'parse dotnet 10.0',
      projectPath: './test/fixtures/dotnetcore/dotnet_10',
      projectFile: 'dotnet_10.csproj',
      targetFramework: 'net10.0',
      manifestFilePath: 'obj/project.assets.json',
    },
    {
      description: 'parse dotnet 10.0 with windows workload',
      projectPath: './test/fixtures/dotnetcore/dotnet_10_windows_workload',
      projectFile: 'dotnet_10_windows_workload.csproj',
      targetFramework: 'net10.0-windows',
      manifestFilePath: 'obj/project.assets.json',
    },
  ])(
    'succeeds given a project file and returns a single dependency graph for single-targetFramework projects: $description - new Parser',
    async ({
      projectPath,
      projectFile,
      manifestFilePath,
      targetFramework,
      projectNamePrefix,
    }) => {
      await runInProjectDir(projectPath, async (absoluteProjectPath) => {
        // Run a dotnet restore beforehand, in order to be able to supply a project.assets.json file
        await dotnet.restore(path.resolve(projectFile));

        const result = await plugin.inspect(
          absoluteProjectPath,
          manifestFilePath,
          {
            'dotnet-runtime-resolution': true,
            'dotnet-target-framework': targetFramework,
            useFixForImprovedDotnetFalsePositives: true,
            useImprovedDotnetWithoutPublish: true,
            ...(projectNamePrefix
              ? { 'project-name-prefix': projectNamePrefix }
              : {}),
          },
        );

        if (!pluginApi.isMultiResult(result)) {
          throw new Error('expected a multiResult response from inspection');
        }

        expect(result.scannedProjects.length).toEqual(1);

        const expectedGraph = JSON.parse(
          fs.readFileSync(path.resolve('expected_depgraph-v3.json'), 'utf-8'),
        );
        expect(result.scannedProjects[0].depGraph?.toJSON()).toEqual(
          expectedGraph.depGraph,
        );
      });
    },
    100000,
  );

  (ISWINDOWS ? it.skip : it).each([
    {
      description: 'it is in property group that is not first - net462',
      projectPath: './test/fixtures/target-framework/target-framework-utf16le',
      projectFile: 'target-framework-utf16le.csproj',
      targetFramework: 'net462',
      manifestFilePath: 'obj/project.assets.json',
    },
    {
      description: 'simple net48',
      projectPath: './test/fixtures/target-framework/simple-net48',
      projectFile: 'simple-net48.csproj',
      targetFramework: 'net48',
      manifestFilePath: 'obj/project.assets.json',
    },
  ])(
    'succeeds given a project file and returns a single dependency graph for .net framework on v3: $description ',
    async ({ projectPath, projectFile, manifestFilePath, targetFramework }) => {
      await runInProjectDir(projectPath, async (absoluteProjectPath) => {
        // Run a dotnet restore beforehand, in order to be able to supply a project.assets.json file
        await dotnet.restore(path.resolve(projectFile));

        const result = await plugin.inspect(
          absoluteProjectPath,
          manifestFilePath,
          {
            'dotnet-runtime-resolution': true,
            'dotnet-target-framework': targetFramework,
            useFixForImprovedDotnetFalsePositives: true,
            useImprovedDotnetWithoutPublish: true,
          },
        );

        if (!pluginApi.isMultiResult(result)) {
          throw new Error('expected a multiResult response from inspection');
        }

        expect(result.scannedProjects.length).toEqual(1);

        const expectedGraph = JSON.parse(
          fs.readFileSync(path.resolve('expected_depgraph-v3.json'), 'utf-8'),
        );
        expect(result.scannedProjects[0].depGraph?.toJSON()).toEqual(
          expectedGraph.depGraph,
        );
      });
    },
    100000,
  );

  it.each([
    {
      description: 'parse dotnet 6.0 and 7.0',
      projectPath: './test/fixtures/dotnetcore/dotnet_6_and_7',
      expectedDepGraphs: 2,
    },
  ])(
    'succeeds given a project file and returns multiple dependency graphs for multi-targetFramework projects: $description',
    async ({ projectPath, expectedDepGraphs }) => {
      await runInProjectDir(projectPath, async (absoluteProjectPath) => {
        // Run a dotnet restore beforehand, in order to be able to supply a project.assets.json file
        await dotnet.restore('dotnet_6_and_7.csproj');

        const manifestFile = 'obj/project.assets.json';

        const result = await plugin.inspect(absoluteProjectPath, manifestFile, {
          'dotnet-runtime-resolution': true,
          useFixForImprovedDotnetFalsePositives: true,
        });

        if (!pluginApi.isMultiResult(result)) {
          throw new Error('expected a multiResult response from inspection');
        }

        expect(result.scannedProjects.length).toEqual(expectedDepGraphs);

        const expectedGraphs = JSON.parse(
          fs.readFileSync(path.resolve('expected_depgraphs.json'), 'utf-8'),
        );

        const toJson = result.scannedProjects.map((result) =>
          result.depGraph?.toJSON(),
        );
        expect(toJson).toEqual(expectedGraphs);
      });
    },
  );

  it('does not include ignored packages in the resulting depGraph', async () => {
    const projectPath = './test/fixtures/dotnetcore/dotnet_6';
    await dotnet.restore('dotnet_6.csproj', projectPath);
    const manifestFile = 'obj/project.assets.json';
    const result = await plugin.inspect(projectPath, manifestFile, {
      'dotnet-runtime-resolution': true,
      useFixForImprovedDotnetFalsePositives: true,
    });

    if (!pluginApi.isMultiResult(result)) {
      throw new Error('expected a multiResult response from inspection');
    }

    const depGraph = result.scannedProjects[0].depGraph;

    // TS doesn't get expect().toBeDefined() and will still complain
    if (!depGraph) {
      throw new Error('expected depGraph to be defined');
    }

    const pkgNames = depGraph.getDepPkgs().map((pkg) => pkg.name);
    const filteredPkgNames: string[] = pkgNames.filter((pkgName) =>
      FILTERED_DEPENDENCY_PREFIX.some((prefix) => pkgName.startsWith(prefix)),
    );
    expect(filteredPkgNames).toEqual([]);
  });

  it.each([
    {
      description: 'net472 - with package.assets.json',
      projectPath: './test/fixtures/target-framework/no-dependencies/',
      manifestFile: 'obj/project.assets.json',
      requiresRestore: true,
      expectedErrorMessage: /not able to find any supported TargetFrameworks/,
    },
    {
      description: 'net461 - no package.assets.json',
      projectPath: './test/fixtures/packages-config/repositories-config/',
      manifestFile: 'project.json',
      requiresRestore: false,
      expectedErrorMessage:
        /runtime resolution flag is currently only supported/,
    },
  ])(
    'does not allow the runtime option to be set on unsupported projects: $description',
    async ({
      projectPath,
      manifestFile,
      requiresRestore,
      expectedErrorMessage,
    }) => {
      if (requiresRestore) {
        await dotnet.restore(projectPath);
      }

      await expect(
        async () =>
          await plugin.inspect(projectPath, manifestFile, {
            'dotnet-runtime-resolution': true,
            useFixForImprovedDotnetFalsePositives: true,
          }),
      ).rejects.toThrow(expectedErrorMessage);
    },
  );
});
