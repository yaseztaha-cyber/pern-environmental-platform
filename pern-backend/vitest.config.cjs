const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    globals: true,
    include: ['__tests__/**/*.test.js'],
  },
});
