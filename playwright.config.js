const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './src/tests',
  timeout: 60000,
  expect: {
    timeout: 10000
  },
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
  },
});
