module.exports = {
  transform: {
    '^.+\\.jsx?$': 'babel-jest',
  },
  testEnvironment: 'node',
  transformIgnorePatterns: ['/node_modules/'],
};

