import { getTargetFrameworksFromProjFile } from '../lib/nuget-parser/csproj-parser';

const targetFrameworkInNonFirstPropertyGroup =
  './test/stubs/target-framework-version-in-non-first-property-group';
const multipleTargetFrameworksPath =
  './test/stubs/target_framework/csproj_multiple';

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
});
