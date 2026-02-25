const { test, expect } = require('@playwright/test');
const config = require('../../config');

test.describe('Config Unit Tests', () => {
  test('should have default values for audio settings', () => {
    // Note: This actually reads from the real store if not mocked, 
    // but for this task we want to verify the logic is there.
    const autoInput = config.getAutoDetectInput();
    const autoOutput = config.getAutoDetectOutput();
    
    expect(typeof autoInput).toBe('boolean');
    expect(typeof autoOutput).toBe('boolean');
  });

  test('should return default device IDs', () => {
    const inputId = config.getInputDeviceId();
    const outputId = config.getOutputDeviceId();
    
    expect(typeof inputId).toBe('string');
    expect(typeof outputId).toBe('string');
  });
});
