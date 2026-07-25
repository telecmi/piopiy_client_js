const {EventEmitter} = require('events');

class PIOPIY extends EventEmitter {
  constructor() {
    super();
    this.loggedIn = false;
    this.speakerOn = false;
  }

  login() {
    this.loggedIn = true;
    this.emit('login', {code: 200, status: 'login successfully'});
  }

  logout() {
    this.loggedIn = false;
    this.emit('logout', {code: 200, status: 'logout successfully'});
  }

  registerToken(_push, callback) {
    if (typeof callback === 'function') {
      callback({code: 200});
    }
  }

  unregisterToken(callback) {
    if (typeof callback === 'function') {
      callback({code: 200});
    }
  }

  call() {}
  answer() {
    this.emit('answered', {code: 200, status: 'answered'});
  }
  reject() {
    this.emit('hangup', {code: 200, status: 'call hangup'});
  }
  terminate() {
    this.emit('hangup', {code: 200, status: 'call hangup'});
  }
  reRegister() {}
  sendDtmf() {}
  hold() {}
  unHold() {}
  mute() {}
  unMute() {}
  transfer() {}
  teamTransfer() {}
  merge() {}
  cancel() {}

  speaker(on) {
    this.speakerOn = !!on;
    return this.speakerOn;
  }

  isLogedIn() {
    return this.loggedIn;
  }

  isConnected() {
    return this.loggedIn;
  }

  onHold() {
    return false;
  }

  onMute() {
    return false;
  }

  onSpeaker() {
    return this.speakerOn;
  }

  getCallId() {
    return false;
  }

  getCallID() {
    return false;
  }
}

module.exports = PIOPIY;
module.exports.default = PIOPIY;
