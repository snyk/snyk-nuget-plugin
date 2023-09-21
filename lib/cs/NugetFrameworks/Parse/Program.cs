using NuGet.Frameworks;
using Newtonsoft.Json;

namespace ShortNameToLongName;

class Program
{
    static void Main(string[] args)
    {
        if (args.Length < 1)
        {
            Console.WriteLine("Usage: dotnet run <shortTargetFramework>");
            return;
        }

        string shortName = args[0];

        try
        {
            NuGetFramework framework = NuGetFramework.Parse(shortName);
            string json = JsonConvert.SerializeObject(new
            {
                framework.Framework,
                framework.Version,
                framework.Platform,
                framework.PlatformVersion,
                framework.HasPlatform,
                framework.HasProfile,
                framework.Profile,
                framework.DotNetFrameworkName,
                framework.DotNetPlatformName,
                framework.IsPCL,
                framework.IsPackageBased,
                framework.AllFrameworkVersions,
                framework.IsUnsupported,
                framework.IsAgnostic,
                framework.IsAny,
                framework.IsSpecificFramework,
                ShortName = shortName
            }, Formatting.None);
            Console.Write(json);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error: {ex.Message}");
        }
    }
}