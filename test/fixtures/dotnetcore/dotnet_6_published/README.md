The `obj/project.assets.json` files changes between `dotnet restore` and `dotnet publish`. Hence, we need fixtures for
both, in order to avoid tests overwriting each other between runs, causing unreproducible tests.
