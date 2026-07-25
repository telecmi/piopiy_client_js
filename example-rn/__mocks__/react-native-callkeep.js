const noop = () => undefined;

const RNCallKeep = {
  setup: () => Promise.resolve(),
  setAvailable: noop,
  registerPhoneAccount: noop,
  registerAndroidEvents: noop,
  addEventListener: noop,
  removeEventListener: noop,
  displayIncomingCall: noop,
  reportNewIncomingCall: noop,
  setCurrentCallActive: noop,
  endCall: noop,
  answerIncomingCall: noop,
  backToForeground: noop,
};

module.exports = RNCallKeep;
module.exports.default = RNCallKeep;
