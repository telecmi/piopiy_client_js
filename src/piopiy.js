import _ from 'lodash';
import { EventEmitter } from 'events';
import ua from './userAgent';
import Audio from './audio';
import rest from './rest';
import { SocketCMI } from './socket';





let userAgent = new ua();
let cmiAudio = new Audio();
let RestCMI = new rest();
export default class extends EventEmitter {



    constructor( options ) {
        super()
        this.piopiyOption = {};
        this.ua = {};
        let option = options || {};
        EventEmitter.bind( this );
        this.name = 'PIOPIYJS';
        this.version = '0.0.5';
        this.ice_servers = [
            { 'urls': 'stun:stunind.telecmi.com' }
        ]
        this.piopiyOption.debug = ( _.isBoolean( option.debug ) ) ? option.debug : false;
        this.piopiyOption.autoplay = _.isBoolean( option.autoplay ) ? option.autoplay : true;
        this.piopiyOption.autoReboot = _.isBoolean( option.autoReboot ) ? option.autoReboot : true;
        this.piopiyOption.ringTime = _.isNumber( option.ringTime ) ? option.ringTime : 60;
        this.piopiyOption.displayName = _.isString( option.name ) ? option.name : null;

        if ( this.piopiyOption.autoplay ) {

            cmiAudio.audioTag();
        }


    }



    login ( user_id, password, region ) {

        let _this = this;
        let sbc_region = region || 'sbcsg.telecmi.com';
        if ( _.isString( user_id ) && _.isString( password ) ) {


            var credentials = {
                uri: user_id + '@' + region,
                authorization_user: user_id,
                password: password,
                debug: this.piopiyOption.debug,
                display_name: this.piopiyOption.displayName,
                no_answer_timeout: this.piopiyOption.ringTime,
                register: true,
                region: sbc_region,
                session_timers: false
            }

            userAgent.start( credentials, _this );





            RestCMI.getToken( user_id, password, ( data ) => {
                if ( data.code == 200 ) {
                    _this.socketCMI = new SocketCMI( data.token, _this )
                }
            } )
        } else {
            throw new Error( "invalid user_id or password" );
        }
    }


    logout () {
        let _this = this;
        userAgent.stop( _this );
    }

    call ( to, options ) {
        let _this = this;
        if ( !_.isString( to ) ) {
            _this.emit( 'error', { code: 1002, status: 'Invalid type to call' } )
            return;
        }

        if ( _.isObject( options ) ) {
            if ( !isString( options.extra_param ) ) {
                _this.emit( 'error', { code: 1002, status: 'extra_param must be string' } );
                return;
            }
        }


        userAgent.make( to, _this, options );
    }

    terminate () {
        let _this = this;
        userAgent.terminate( _this );
    }


    reRegister () {
        userAgent.re_register();
    }



    answer () {
        let _this = this;
        userAgent.answer( _this );
    }
    reject () {
        let _this = this;
        userAgent.reject( _this );
    }

    sendDtmf ( no ) {
        let _this = this;
        userAgent.dtmf( no, _this );
    }

    hold () {
        let _this = this;
        userAgent.hold( _this );
    }

    unHold () {
        let _this = this;
        userAgent.unhold( _this );
    }

    mute () {

        let _this = this;
        userAgent.mute( _this );

    }

    unMute () {

        let _this = this;
        userAgent.unmute( _this );

    }

    isLogedIn () {
        let _this = this;
        return userAgent.islogedin( _this );
    }

    isConnected () {
        let _this = this;
        return userAgent.isConnected( _this );
    }

    onHold () {
        let _this = this;
        return userAgent.onhold( _this );
    }

    onMute () {
        let _this = this;
        return userAgent.onmute( _this );
    }

    transfer ( to ) {
        let _this = this;
        _this.socketCMI.transfer( userAgent.getCallId( _this ), to )
    }

    merge () {
        let _this = this;
        userAgent.dtmf( '0', _this );
    }

    cancel () {
        let _this = this;
        userAgent.dtmf( '#', _this );
    }


    getCallId () {
        let _this = this;
        return userAgent.getCallId( _this );

    }

    getCallID () {
        let _this = this;
        return userAgent.getCallID( _this );

    }

}

const isString = ( value ) => {
    return typeof value === 'string';
}


