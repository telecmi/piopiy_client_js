import rtcstat from './stats';

let RTCStat = new rtcstat();


export default class {


    connections(session, RTCPeer, _this) {

        RTCPeer.oniceconnectionstatechange = () => {

            if (RTCPeer.iceConnectionState == 'disconnected') {
                if (_this.cmi_webrtc_stats) {
                    clearInterval(_this.cmi_webrtc_stats)
                }
                session.renegotiate({ rtcOfferConstraints: { iceRestart: true, offerToReceiveAudio: true, offerToReceiveVideo: false } });

                _this.emit('RTC', { state: 'disconnected', msg: 'CMI_NET' })
            } else if (RTCPeer.iceConnectionState == 'connected') {
                RTCStat.getStats(RTCPeer, _this)
                _this.emit('RTC', { state: 'connected', msg: 'CMI_NET' })
            }
        };
    }


}