module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(ts)?$': 'ts-jest',
  },
  testMatch: ['**/*.spec.ts'],
  collectCoverage: false,
  moduleFileExtensions: ['ts', 'js', 'json'],
  forceExit: true,
  // `dotnet` commands on fresh machines requires restoration of modules which can take a while to resolve.
  testTimeout: 80000,
};
