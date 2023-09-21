Instead of reinventing the wheel of Nuget, we want to utilize the power
of [Nuget.Frameworks](https://www.nuget.org/packages/NuGet.Frameworks) itself.

Since we know that `dotnet` is already installed on the user's machine, we can utilize this to wrap some calls to the
.NET CLI from the plugin.
