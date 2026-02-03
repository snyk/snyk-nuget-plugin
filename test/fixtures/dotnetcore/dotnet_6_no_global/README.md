## Summary

This test is an exact clone of `dotnet_6` except it is missing the `global.json` file.

## Purpose

This fixture serves as a canary test for cross-SDK compatibility. It can be safely run in environments where the exact .NET SDK 6.0.428 is not installed (e.g., SDK 7/8/9/10 images).

## Background

The `dotnet_6` fixture includes a `global.json` with:
```json
{
  "sdk": {
    "version": "6.0.428",
    "rollForward": "disable"
  }
}
```

When runtime resolution (v3 graph generation) is enabled, the plugin executes `dotnet --info` and `dotnet --list-runtimes` in the project directory. If `global.json` specifies a strict SDK version that isn't installed, these commands will fail.

By removing `global.json`, this fixture allows the system's default SDK to be used, enabling integration tests to verify that:
1. The plugin successfully scans .NET 6.0 projects across different SDK environments
2. Basic runtime resolution functionality works
3. The dependency graph is generated without errors

## Usage in Tests

This fixture is used in canary tests that verify successful execution without asserting exact dependency graph contents, as the runtime assembly versions may vary depending on the host SDK version.