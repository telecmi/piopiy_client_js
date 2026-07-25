// jsdom because the web build pulls in jsSIP, which expects a browser-like
// global scope. babel-jest transpiles src/ via the repo .babelrc.
module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/test/**/*.test.js'],
  transform: { '^.+\\.[jt]sx?$': 'babel-jest' },
  // jsSIP + socket.io-client ship CommonJS, so they don't need transforming.
  transformIgnorePatterns: ['/node_modules/'],
};
