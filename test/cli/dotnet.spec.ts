import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import * as dotnet from '../../lib/nuget-parser/cli/dotnet';
import * as codeGenerator from '../../lib/nuget-parser/csharp/generator';
import * as fs from 'fs';
import * as types from '../../lib/nuget-parser/types';
import * as nugetFrameworksParser from '../../lib/nuget-parser/csharp/nugetframeworks_parser';
import * as subprocess from '../../lib/nuget-parser/cli/subprocess';
import * as os from 'os';

describe('when running the dotnet cli command', () => {
  const projectDirs: Record<string, string> = {};
  beforeAll(() => {});

  afterAll(() => {
    codeGenerator.tearDown(Object.values(projectDirs));
  });

  it('publishes a dependency file correctly to the published folder', async () => {
    const files: types.DotNetFile[] = [
      {
        name: 'program.cs',
        contents: `
using System;
class TestFixture {
    static public void Main(String[] args)
    {
      var client = new System.Net.Http.HttpClient();
      Console.WriteLine("Hello, World!");
    }
}
`,
      },
      {
        name: 'dotnet_6.csproj',
        contents: `
<Project Sdk='Microsoft.NET.Sdk'>
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net6.0</TargetFramework>
    <RuntimeIdentifier>linux-x64</RuntimeIdentifier>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include='NSubstitute' Version='4.3.0'/>
  </ItemGroup>
</Project>
`,
      },
    ];
    projectDirs['runtimeDepsDiffer'] = codeGenerator.generate(
      'fixtures',
      files,
    );

    const publishDir = await dotnet.publish(projectDirs['runtimeDepsDiffer']);
    const contents = fs.readdirSync(publishDir);
    expect(contents).toContain('dotnet_6.deps.json');
  });

  it('publishes a dependency file correctly to the published folder that has multiple target frameworks', async () => {
    const fixtures: types.DotNetFile[] = [
      {
        name: 'program.cs',
        contents: `
using System;
class TestFixture {
    static public void Main(String[] args)
    {
      var client = new System.Net.Http.HttpClient();
      Console.WriteLine("Hello, World!");
    }
}
`,
      },
      {
        name: 'dotnet_6_and_7.csproj',
        contents: `
<Project Sdk='Microsoft.NET.Sdk'>
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFrameworks>net6.0;net7.0</TargetFrameworks>
    <RuntimeIdentifier>linux-x64</RuntimeIdentifier>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include='NSubstitute' Version='4.3.0'/>
  </ItemGroup>
</Project>
`,
      },
    ];
    projectDirs['multipleTargetFrameworks'] = codeGenerator.generate(
      'fixtures',
      fixtures,
    );

    const publishDir = await dotnet.publish(
      projectDirs['multipleTargetFrameworks'],
      'net7.0',
    );
    const contents = fs.readdirSync(publishDir);
    expect(contents).toContain('dotnet_6_and_7.deps.json');
  });

  it.each([
    {
      shortName: 'net6.0',
      expected: '.NETCoreApp,Version=v6.0',
    },
    {
      shortName: 'netcore451',
      expected: '.NETCore,Version=v4.5.1',
    },
    {
      shortName: 'wpa8101',
      expected: 'WindowsPhoneApp,Version=v8.1.0.1',
    },
    {
      shortName: 'klaatu barada nikto!!!',
      expected: 'Unsupported,Version=v0.0',
    },
  ])(
    'parses ShortName TFM to LongName using Nuget.Frameworks successfully',
    async ({ shortName, expected }) => {
      const location = nugetFrameworksParser.generate();
      await dotnet.restore(location);
      const response = await dotnet.run(location, [shortName]);

      const targetFrameworkInfo: types.TargetFrameworkInfo =
        JSON.parse(response);

      expect(targetFrameworkInfo.ShortName).toEqual(shortName);
      expect(targetFrameworkInfo.DotNetFrameworkName).toEqual(expected);
    },
  );
});

describe('dotnet error handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('includes command, args, and options in error message when subprocess fails with stdout/stderr', async () => {
    const mockError = {
      stdout: 'mock stdout',
      stderr: 'mock stderr error',
    };

    jest.spyOn(subprocess, 'execute').mockRejectedValue(mockError);

    try {
      await dotnet.validate();
      fail('Expected function to throw');
    } catch (error: any) {
      expect(error.message).toContain(
        'dotnet version failed with error: mock stderr error',
      );
      expect(error.message).toContain('Command: dotnet');
      expect(error.message).toContain('Args: ["--version"]');
      expect(error.message).toContain('Options: {}');
    }
  });

  it('includes command, args, and options in error message when subprocess fails with unknown error', async () => {
    const mockError = new Error('Unknown error occurred');

    jest.spyOn(subprocess, 'execute').mockRejectedValue(mockError);

    try {
      await dotnet.validate();
      fail('Expected function to throw');
    } catch (error: any) {
      expect(error.message).toContain(
        'dotnet version failed with error: Error: Unknown error occurred',
      );
      expect(error.message).toContain('Command: dotnet');
      expect(error.message).toContain('Args: ["--version"]');
      expect(error.message).toContain('Options: {}');
    }
  });

  it('includes command, args, and options in error message for execute function with project path', async () => {
    const mockError = {
      stdout: '',
      stderr: 'Build failed',
    };

    jest.spyOn(subprocess, 'execute').mockRejectedValue(mockError);

    const testArgs = ['build', '--configuration', 'Release'];
    const testProjectPath = '/path/to/project';

    try {
      await dotnet.execute(testArgs, testProjectPath);
      fail('Expected function to throw');
    } catch (error: any) {
      expect(error.message).toContain(
        'dotnet execute failed with error: Build failed',
      );
      expect(error.message).toContain('Command: dotnet');
      expect(error.message).toContain(
        'Args: ["build","--configuration","Release"]',
      );
      expect(error.message).toContain('Options: {"cwd":"/path/to/project"}');
    }
  });

  it('includes command, args, and options in error message for restore function', async () => {
    const mockError = {
      stdout: '',
      stderr: 'Package restore failed',
    };

    jest.spyOn(subprocess, 'execute').mockRejectedValue(mockError);

    const testProjectPath = '/path/to/project.csproj';
    const testWorkingDirectory = '/path/to/working/dir';

    try {
      await dotnet.restore(testProjectPath, testWorkingDirectory);
      fail('Expected function to throw');
    } catch (error: any) {
      expect(error.message).toContain(
        'dotnet restore failed with error: Package restore failed',
      );
      expect(error.message).toContain('Command: dotnet');
      expect(error.message).toContain(
        'Args: ["restore","--verbosity","normal","\\"',
      );
      expect(error.message).toContain(
        `Options: {"cwd":"${testWorkingDirectory}"}`,
      );
    }
  });

  it('uses stdout when stderr is empty in error message', async () => {
    const mockError = {
      stdout: 'stdout error message',
      stderr: '',
    };

    jest.spyOn(subprocess, 'execute').mockRejectedValue(mockError);

    try {
      await dotnet.validate();
      fail('Expected function to throw');
    } catch (error: any) {
      expect(error.message).toContain(
        'dotnet version failed with error: stdout error message',
      );
      expect(error.message).toContain('Command: dotnet');
      expect(error.message).toContain('Args: ["--version"]');
      expect(error.message).toContain('Options: {}');
    }
  });

  it('sanitizes sensitive information in error messages', async () => {
    const mockError = {
      stdout: '',
      stderr: 'Restore failed',
    };

    const homeDir = os.homedir();
    const tempDir = os.tmpdir();

    jest.spyOn(subprocess, 'execute').mockRejectedValue(mockError);

    try {
      await dotnet.restore(
        `${homeDir}/secret-project/MyApp.csproj`,
        `${tempDir}/working-dir`,
      );
      fail('Expected function to throw');
    } catch (error: any) {
      expect(error.message).toContain(
        'dotnet restore failed with error: Restore failed',
      );
      expect(error.message).toContain(
        '\\"<HOME>/secret-project/MyApp.csproj\\"',
      );
      expect(error.message).toContain('<TEMP>/working-dir');
      expect(error.message).not.toContain(homeDir);
      expect(error.message).not.toContain(tempDir);
    }
  });
});
