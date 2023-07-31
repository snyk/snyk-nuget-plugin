module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(ts)?$': 'ts-jest',
  },
  testMatch: ['**/*.spec.ts'],
  testTimeout: 10000,
  collectCoverage: false,
  moduleFileExtensions: ['ts', 'js', 'json'],
  forceExit: true,
};
