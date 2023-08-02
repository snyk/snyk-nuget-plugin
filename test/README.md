# Tests and fixtures

A large proportion of these tests depend on dynamically created test fixtures, which will cause files to be written to
your file system when running them.

Many rely on `dotnet restore` to generate dependency graphs and assets files, which means they are generally unit tests
with external dependencies, mainly Nuget's package API.

If you want to ensure you're running on a clean system, you can always try and clean unknown git files with something
like

```bash
git clean -x -f -d -e node_modules -e <other_folders_you_like, e.g. .vscode or .idea>
```

.. and run the tests again.

```bash
npm run test
```

## Adding new tests

In general, fixture files that can be generated should try to be avoided polluting the git history, if possible. It's
given that it's not entirely possible to achieve, not even by the existing fixtures, but it's a general guideline.

Adding test cases related to .NET's frameworks are not expected to test anything that is no longer in support by
Microsoft. See more about that [here](https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core).
