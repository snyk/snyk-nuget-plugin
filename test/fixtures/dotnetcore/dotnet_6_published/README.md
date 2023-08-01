The `obj/project.assets.json` files changes between `dotnet restore` and `dotnet publish`. Hence, we need fixtures for
both types, if we want to test both types of behavior.

This project consists of the `obj/project.assets.json` you'd get if running a `dotnet publish` on the current solution
inside this fixture folder.
