



let audioPlay = new Audio( 'tone/ringtone.mp3' );
audioPlay.loop = true;
audioPlay.load();



let focus = true;





let global_this = {};




export const piopiy_start = async ( _this ) => {



    //Agent/User ID and password

    _this.piopiy.login( "3011_2224302", "123456", "sbcind.telecmi.com" );

    window.piopiy = _this.piopiy;
    _this.piopiy.on( 'login', function ( object ) {

        _this.isSIP = true;

    } );

    _this.piopiy.on( 'logout', function ( object ) {


        _this.isSIP = false;

    } )



    _this.piopiy.on( 'loginFailed', function ( object ) {


        if ( object.code === 401 ) {

        }
        _this.isSIP = false;

    } )


    _this.piopiy.on( 'connected', function ( object ) {


    } )

    _this.piopiy.on( 'disconnected', function ( object ) {


    } )


    _this.piopiy.on( 'error', function ( object ) {

    } )


    _this.piopiy.on( 'ended', function ( object ) {

        if ( !focus ) {

        }
        audioPlay.pause();
        _this.setState( { dialState: 'Hangup' } )
        _this.setState( { dial: false } );
        _this.setState( { hold: true } );
        _this.setState( { incoming: false } );
        _this.setState( { dialnumber: '' } );
        _this.setState( { call: true } );

    } )




    _this.piopiy.on( 'rejected', function ( object ) {

        audioPlay.pause();
        _this.setState( { incoming: false } );
        _this.setState( { dialnumber: '' } );
    } )

    _this.piopiy.on( 'answered', function ( object ) {


        audioPlay.pause();
        _this.setState( { dialState: 'answered' } );
        _this.setState( { hold: true } );
    } )

    _this.piopiy.on( 'hangup', function ( object ) {


        if ( !focus ) {


        }
        audioPlay.pause();
        _this.setState( { dialState: 'Hangup' } )
        _this.setState( { dialnumber: '' } );
        _this.setState( { dial: false } );
        _this.setState( { incoming: false } );
        _this.setState( { hold: true } );
        _this.setState( { call: true } );

    } )

    _this.piopiy.on( 'mediaFailed', function ( object ) {

        audioPlay.pause();
        _this.setState( { dialState: 'Hangup' } );
        _this.setState( { dial: false } );
        _this.setState( { incoming: false } );
        alert( 'Please check your Audio Device' )


        //Disable hangup button from Web state
        _this.setState( { call: true } );
    } )

    _this.piopiy.on( 'inComingCall', function ( e ) {


        audioPlay.currentTime = 0;


        if ( !focus ) {

        }




        if ( localStorage.muteRingtone != 'true' ) {
            var playPromise = audioPlay.play();

            if ( playPromise !== undefined ) {
                playPromise.then( _ => {

                } ).catch( error => {

                } );
            }
        }




    } )

    _this.piopiy.on( 'ringing', ( e ) => {
        _this.setState( { dialState: 'Ringing' } )
    } )

    _this.piopiy.on( 'dtmf', ( e ) => {



    } );

    _this.piopiy.on( 'hold', ( e ) => {



    } );

    _this.piopiy.on( 'unhold', ( e ) => {


    } );

    _this.piopiy.on( 'transfer', ( e ) => {
    } )

    _this.piopiy.on( 'record', ( e ) => {
        e['record'] = true
    } )

    _this.piopiy.on( 'missed', ( e ) => {

        audioPlay.pause();
        _this.setState( { incoming: false } );
    } )
    _this.piopiy.on( 'trying', ( e ) => {
        _this.setState( { dialState: 'Trying' } )


        //Disable call button from Web state
        _this.setState( { call: false } );
    } )

    _this.piopiy.on( 'callStream', ( e ) => {

    } )

    global_this = _this;

}



export const make_call = ( _this, number ) => {

    //Disable call button from Web state
    _this.setState( { call: false } );

    _this.piopiy.call( number );

}

export const terminate = ( _this ) => {
    audioPlay.pause();
    _this.setState( { dial: false } );

    //Disable hangup button from Web state
    _this.setState( { call: true } );
    _this.piopiy.terminate();
}

export const dtmf = ( _this, dtmf ) => {

    _this.piopiy.sendDtmf( dtmf );
}

export const reRegister = ( _this, dtmf ) => {

    _this.piopiy.reRegister();
}


export const transfer = ( _this, no ) => {

    _this.piopiy.transfer( _this.piopiy.getCallId(), no )


}


export const record = ( _this, no ) => {


    _this.piopiy.sendDtmf( "*5" );

}

export const merge = ( _this ) => {

    _this.piopiy.sendDtmf( "0" );
}

export const cancel_transfer = ( _this ) => {

    _this.piopiy.sendDtmf( "#" );
}




export const answer = ( _this ) => {
    audioPlay.pause();
    _this.piopiy.answer();
    _this.setState( { incoming: false } );
    _this.setState( { dial: true } );

}

export const reject = ( _this ) => {
    audioPlay.pause();
    _this.piopiy.reject();
    _this.setState( { incoming: false } );
}

export const hold = ( _this ) => {
    _this.setState( { hold: false } )
    _this.piopiy.hold();
}

export const unhold = ( _this ) => {
    _this.setState( { hold: true } )
    _this.piopiy.unHold();
}

export const mute = ( _this ) => {
    _this.setState( { mute: false } )
    _this.piopiy.mute();
}

export const unmute = ( _this ) => {
    _this.setState( { mute: true } )
    _this.piopiy.unMute();
}



export const stop = async ( _this ) => {


    await global_this.piopiy.logout();
}