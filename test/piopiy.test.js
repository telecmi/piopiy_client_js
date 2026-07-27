import PIOPIY from '../src/index.js';

describe('PIOPIY constructor options', () => {
  test('applies documented defaults', () => {
    const p = new PIOPIY();
    expect(p.piopiyOption.ringTime).toBe(40); // lowered from 60 in 0.17.0
    expect(p.piopiyOption.registerExpires).toBe(120);
    expect(p.piopiyOption.debug).toBe(false);
    expect(p.piopiyOption.autoplay).toBe(true);
    expect(p.piopiyOption.autoReboot).toBe(true);
  });

  test('reports the package version', () => {
    expect(new PIOPIY().version).toBe('0.18.1');
  });

  test('honours overrides', () => {
    const p = new PIOPIY({ ringTime: 99, debug: true, name: 'Agent', registerExpires: 300 });
    expect(p.piopiyOption.ringTime).toBe(99);
    expect(p.piopiyOption.debug).toBe(true);
    expect(p.piopiyOption.registerExpires).toBe(300);
    expect(p.piopiyOption.displayName).toBe('Agent');
  });

  test('ignores non-number ringTime and falls back to default', () => {
    const p = new PIOPIY({ ringTime: 'nope' });
    expect(p.piopiyOption.ringTime).toBe(40);
  });
});

describe('PIOPIY state before login', () => {
  test('is not logged in', () => {
    expect(new PIOPIY().isLogedIn()).toBe(false);
  });

  test('getCallId / getCallID return false with no active call', () => {
    const p = new PIOPIY();
    expect(p.getCallId()).toBe(false);
    expect(p.getCallID()).toBe(false);
  });
});

describe('livekitIncoming() push routing', () => {
  test('a cancel_call payload dismisses the ringing UI and flags a missed call', () => {
    const p = new PIOPIY();
    const seen = [];
    p.on('callkeepCancel', d => seen.push(['callkeepCancel', d]));
    p.on('missedCall', d => seen.push(['missedCall', d]));

    const handled = p.livekitIncoming({ type: 'cancel_call', uuid: 'ABC-123', from: '+15551234567' });

    expect(handled).toBe(true);
    const names = seen.map(e => e[0]);
    expect(names).toContain('callkeepCancel');
    expect(names).toContain('missedCall');
    // uuid is normalised to lower-case in the cancel path
    const cancel = seen.find(e => e[0] === 'callkeepCancel')[1];
    expect(cancel.uuid).toBe('abc-123');
  });

  test('an invalid cancel payload (no uuid) is not treated as a cancel', () => {
    const p = new PIOPIY();
    let missed = false;
    p.on('missedCall', () => { missed = true; });
    // no uuid → not a valid cancel; must not emit missedCall
    p.livekitIncoming({ type: 'cancel_call' });
    expect(missed).toBe(false);
  });
});

describe('apiBase option', () => {
  test('defaults to production when not set', () => {
    const p = new PIOPIY();
    expect(p.piopiyOption.apiBase).toBeUndefined(); // not stored; applied to the REST client
  });

  test('accepts a staging override without throwing', () => {
    expect(
      () => new PIOPIY({ apiBase: 'https://stagerest.telecmi.com/v2' }),
    ).not.toThrow();
  });
});

describe('logout() unregisters the push token', () => {
  test('reports nothing to unregister when no token was registered', done => {
    const p = new PIOPIY();
    p.logout(res => {
      expect(res.code).toBe(200);
      expect(res.status).toMatch(/no push token/i);
      done();
    });
  });

  test('does not throw when called without a callback', () => {
    expect(() => new PIOPIY().logout()).not.toThrow();
  });
});
