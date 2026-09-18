import rtcstat from './stats';

let RTCStat = new rtcstat();

// How long the ICE connection may stay 'disconnected' before an ICE restart is
// requested. Chrome reports 'disconnected' on any short interruption (a media
// pause of a few hundred milliseconds on the switch is enough, e.g. while a
// transfer is re-bridged) and recovers from it by itself; restarting ICE at
// that moment renegotiates a connection that is about to come back, and on
// FreeSWITCH 1.10 a restarted ICE session often never carries media again
// (one-way or no audio for the rest of the call). 'failed' is final and is
// restarted at once.
const ICE_DISCONNECTED_GRACE_MS = 5000;

export default class {


    connections(session, RTCPeer, _this) {

        const restart = () => {
            if (_this.cmi_webrtc_stats) {
                clearInterval(_this.cmi_webrtc_stats)
            }
            session.renegotiate({ rtcOfferConstraints: { iceRestart: true, offerToReceiveAudio: true, offerToReceiveVideo: false } });
        };

        const clearGrace = () => {
            if (_this.cmi_ice_grace) {
                clearTimeout(_this.cmi_ice_grace);
                _this.cmi_ice_grace = null;
            }
        };

        RTCPeer.oniceconnectionstatechange = () => {

            const state = RTCPeer.iceConnectionState;

            if (state == 'disconnected') {
                // transient: restart only if it has not recovered within the grace period
                clearGrace();
                _this.cmi_ice_grace = setTimeout(() => {
                    _this.cmi_ice_grace = null;
                    const now = RTCPeer.iceConnectionState;
                    if (now == 'disconnected' || now == 'failed') {
                        restart();
                    }
                }, ICE_DISCONNECTED_GRACE_MS);

                _this.emit('RTC', { state: 'disconnected', msg: 'CMI_NET' })
            } else if (state == 'failed') {
                clearGrace();
                restart();
                _this.emit('RTC', { state: 'disconnected', msg: 'CMI_NET' })
            } else if (state == 'connected') {
                clearGrace();
                if (_this.cmi_webrtc_stats) {
                    clearInterval(_this.cmi_webrtc_stats)
                }
                RTCStat.getStats(RTCPeer, _this)
                _this.emit('RTC', { state: 'connected', msg: 'CMI_NET' })
            } else if (state == 'completed' || state == 'closed') {
                // 'completed' follows 'connected' on the same connection: no new stats
                // collection and no second 'connected' event for the application
                clearGrace();
            }
        };
    }


}
