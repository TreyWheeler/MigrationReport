module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
  roots: ['<rootDir>/tests', '<rootDir>/data/tests'],
  setupFilesAfterEnv: ['<rootDir>/tests/setupJest.js'],
  clearMocks: true,
};
