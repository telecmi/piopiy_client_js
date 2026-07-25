const messaging = () => ({
  getToken: () => Promise.resolve('test-fcm-token'),
  onTokenRefresh: () => undefined,
  onMessage: () => undefined,
  setBackgroundMessageHandler: () => undefined,
});

module.exports = messaging;
module.exports.default = messaging;
