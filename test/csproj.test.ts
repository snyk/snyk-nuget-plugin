import * as tap from 'tap';
const test = tap.test;
import * as plugin from '../lib/index';
import {getTargetFrameworksFromProjFile} from '../lib/nuget-parser/csproj-parser';

const multipleFrameworksPath = './test/stubs/target_framework/csproj_multiple/';
const noProjectPath = './test/stubs/target_framework/no_csproj/';
const noValidFrameworksPath = './test/stubs/target_framework/no_target_valid_framework';
const noDeps = './test/stubs/target_framework/no-dependencies/';
const manifestFile = 'obj/project.assets.json';

test('parse dotnet with csproj containing multiple versions retrieves first one', async (t) => {
  const dotnetVersions = await getTargetFrameworksFromProjFile(
    multipleFrameworksPath);
  t.equal('netcoreapp2.0', dotnetVersions!.original);
});

test('parse dotnet with vbproj', async (t) => {
  const res = await plugin.inspect(noProjectPath, manifestFile);
  t.equal(res.package.name, 'no_csproj');
  t.equal(res.plugin.targetRuntime, 'netcoreapp2.0');
});

test('parse dotnet with no deps', async (t) => {
  const res = await plugin.inspect(noDeps, manifestFile);
  t.equal(Object.keys(res.package.dependencies).length, 0);
});

test('parse dotnet with no valid framework defined', async (t) => {
  try {
    await plugin.inspect(noValidFrameworksPath, manifestFile);
    t.fail('Expected error to be thrown!');
  } catch(err) {
    t.equal(err.message, 'No frameworks were found in project.assets.json', 'expected error');
  }
});
