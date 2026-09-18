import RTCPeerHandler from '../src/RTCPeer.js';

jest.mock('../src/stats', () => jest.fn().mockImplementation(() => ({ getStats: jest.fn() })));

describe('RTCPeer ICE restart policy', () => {
  let peer, session, client, handler;

  beforeEach(() => {
    jest.useFakeTimers();
    peer = { iceConnectionState: 'new', oniceconnectionstatechange: null };
    session = { renegotiate: jest.fn() };
    client = { emit: jest.fn(), cmi_webrtc_stats: null, cmi_ice_grace: null };
    handler = new RTCPeerHandler();
    handler.connections(session, peer, client);
  });

  afterEach(() => jest.useRealTimers());

  const setState = (state) => { peer.iceConnectionState = state; peer.oniceconnectionstatechange(); };

  test('a short disconnected blip that recovers does not restart ICE', () => {
    setState('disconnected');
    jest.advanceTimersByTime(800);
    setState('connected');
    jest.advanceTimersByTime(10000);
    expect(session.renegotiate).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith('RTC', { state: 'disconnected', msg: 'CMI_NET' });
    expect(client.emit).toHaveBeenCalledWith('RTC', { state: 'connected', msg: 'CMI_NET' });
  });

  test('disconnected for longer than the grace period restarts ICE once', () => {
    setState('disconnected');
    jest.advanceTimersByTime(4999);
    expect(session.renegotiate).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(session.renegotiate).toHaveBeenCalledTimes(1);
    expect(session.renegotiate.mock.calls[0][0].rtcOfferConstraints.iceRestart).toBe(true);
  });

  test('failed restarts ICE immediately', () => {
    setState('failed');
    expect(session.renegotiate).toHaveBeenCalledTimes(1);
  });

  test('repeated disconnected reports only arm one timer', () => {
    setState('disconnected');
    jest.advanceTimersByTime(3000);
    setState('disconnected');
    jest.advanceTimersByTime(3000);
    expect(session.renegotiate).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2000);
    expect(session.renegotiate).toHaveBeenCalledTimes(1);
  });

  test('connected followed by completed starts stats and emits connected once', () => {
    const stats = require('../src/stats');
    const getStats = stats.mock.results[stats.mock.results.length - 1].value.getStats;
    getStats.mockClear();
    setState('connected');
    setState('completed');
    expect(getStats).toHaveBeenCalledTimes(1);
    expect(client.emit.mock.calls.filter(([, e]) => e.state == 'connected')).toHaveLength(1);
  });

  test('completed cancels a pending restart', () => {
    setState('disconnected');
    setState('completed');
    jest.advanceTimersByTime(10000);
    expect(session.renegotiate).not.toHaveBeenCalled();
  });

  test('closed cancels a pending restart', () => {
    setState('disconnected');
    setState('closed');
    jest.advanceTimersByTime(10000);
    expect(session.renegotiate).not.toHaveBeenCalled();
  });
});
