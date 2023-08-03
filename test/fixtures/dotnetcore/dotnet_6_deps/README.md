The resolved dependency file (`project_name.deps.json`) which you would get when doing a `dotnet publish` for
a `osx-arm64` Runtime Identifier (RID) on a `.csproj` that looks like:

```xml

<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net6.0</TargetFramework>
    <RuntimeIdentifier>linux-x64</RuntimeIdentifier>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="NSubstitute" Version="4.3.0"/>
  </ItemGroup>
</Project>
```
