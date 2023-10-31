import _ from 'lodash';





export default class {


    getStats ( RTCPeer, _this ) {

        let lastPacketsLost = 0;
        let lastPacketsSent = 0;
        let lastTimestamp = Date.now();
        let lastStats = null;
        let cmi_stats = {}

        _this.cmi_webrtc_stats = setInterval( () => {

            if ( RTCPeer ) {

                if ( RTCPeer.connectionState ) {

                    if ( RTCPeer.connectionState != 'connected' ) {
                        clearInterval( _this.cmi_webrtc_stats )
                    }

                    RTCPeer.getStats().then( function ( report ) {


                        report.forEach( ( stats ) => {

                            if ( stats.type === 'candidate-pair' && stats.nominated ) {
                                const currentRoundTripTime = stats.currentRoundTripTime;

                                // Calculate delay and packet loss
                                const delay = currentRoundTripTime;

                                cmi_stats['delay'] = delay;
                            }


                            if ( stats.type === 'inbound-rtp' ) {
                                let packetsLost = stats.packetsLost;

                                const now = Date.now();
                                const timeElapsed = ( now - lastTimestamp ) / 1000; // time in seconds

                                const lostRate = ( packetsLost - lastPacketsLost ) / timeElapsed;

                                cmi_stats['packetLostRate'] = lostRate;

                                lastPacketsLost = packetsLost;

                                lastTimestamp = now;
                            }





                            if ( ( stats.type === 'remote-inbound-rtp' ) ) {
                                var packetsLost = stats.packetsLost;
                                var fractionLost = stats.fractionLost;
                                var jitter = stats.jitter;
                                var rountTrip = stats.totalRoundTripTime;
                                cmi_stats['totalPacketLost'] = packetsLost;
                                cmi_stats['fractionLost'] = fractionLost;
                                cmi_stats['jitter'] = jitter;
                                cmi_stats['rountTrip'] = rountTrip;


                            }

                            if ( ( stats.type === 'codec' ) ) {


                                var codec = stats.mimeType;
                                cmi_stats['codec'] = codec;

                            }

                            if ( ( stats.type === 'local-candidate' ) ) {
                                var networktype = stats.networkType;
                                cmi_stats['network'] = networktype;

                            }
                        } );



                        _this.emit( 'RTCStats', cmi_stats );

                    } ).catch( function ( error ) {

                    } );

                } else {
                    clearInterval( _this.cmi_webrtc_stats )
                }

            } else {
                clearInterval( _this.cmi_webrtc_stats )
            }
        }, 1000 )

    }


}