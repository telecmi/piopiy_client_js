import PIOPIY from '../src/index.js';
import PushTokenManager from '../src/pushToken.js';

describe('autoPushToken option', () => {
  test('defaults to true', () => {
    expect(new PIOPIY().piopiyOption.autoPushToken).toBe(true);
  });

  test('can be disabled', () => {
    expect(new PIOPIY({ autoPushToken: false }).piopiyOption.autoPushToken).toBe(false);
  });

  test('ignores a non-boolean and falls back to the default', () => {
    expect(new PIOPIY({ autoPushToken: 'yes' }).piopiyOption.autoPushToken).toBe(true);
  });

  test('a manager is always attached, enabled or not', () => {
    expect(new PIOPIY()._pushToken_mgr).toBeDefined();
    expect(new PIOPIY({ autoPushToken: false })._pushToken_mgr).toBeDefined();
  });
});

describe('PushTokenManager (web no-op build)', () => {
  test('start() reports "not started" and stop() is safe', () => {
    const m = new PushTokenManager();
    expect(m.start()).toBe(false);
    expect(() => m.stop()).not.toThrow();
  });

  test('constructing the SDK on web does not throw despite autoPushToken', () => {
    expect(() => new PIOPIY({ autoPushToken: true })).not.toThrow();
  });
});
