const noop = () => undefined;

const VoipPushNotification = {
  addEventListener: noop,
  removeEventListener: noop,
  registerVoipToken: noop,
};

module.exports = VoipPushNotification;
module.exports.default = VoipPushNotification;
