import { getTargetFrameworksFromProjFile } from '../lib/nuget-parser/csproj-parser';

const targetFrameworkInNonFirstPropertyGroup =
  './test/stubs/target-framework-version-in-non-first-property-group';
const multipleTargetFrameworksPath =
  './test/stubs/target_framework/csproj_multiple';
const noTargetFrameworksPath =
  './test/stubs/target_framework/no_target_framework';
const noTargetFrameworksPath2 =
  './test/stubs/target_framework/no_target_framework2';

describe('getTargetFrameworksFromProjFile', () => {
  it('should parse target framework version even if it is in property group that is not first', async () => {
    const targetFramework = await getTargetFrameworksFromProjFile(
      targetFrameworkInNonFirstPropertyGroup,
    );

    expect(targetFramework).toMatchObject({
      framework: '.NETFramework',
      original: 'v4.7.2',
      version: '4.7.2',
    });
  });

  it('should return first target framwork if multiple target frameworks are available', async () => {

    const targetFramework = await getTargetFrameworksFromProjFile(
      multipleTargetFrameworksPath,
    );

    expect(targetFramework).toMatchObject({
      framework: '.NETCore',
      original: 'netcoreapp2.0',
      version: '2.0',
    });
  });

  it('should not crash if target framework is not available in project file', async () => {
    const targetFramework = await getTargetFrameworksFromProjFile(
      noTargetFrameworksPath,
    );

    expect(targetFramework).toBeUndefined();
  });

  it('should not crash if target framework is not available in project file when property group exists', async () => {
    const targetFramework = await getTargetFrameworksFromProjFile(
      noTargetFrameworksPath2,
    );

    expect(targetFramework).toBeUndefined();
  });
});
