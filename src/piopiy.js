import { isString, isBoolean, isNumber } from 'lodash-es';
import { EventEmitter } from 'events';
import ua from './userAgent';
import Audio from './audio';








let userAgent = new ua();
let cmiAudio = new Audio();

export default class extends EventEmitter {



    constructor( options ) {
        super()
        this.piopiyOption = {};
        this.ua = {};
        let option = options || {};
        EventEmitter.bind( this );
        this.name = 'PIOPIYJS';
        this.version = '0.5.1';
        this.ice_servers = [
            { 'urls': 'stun:stunind.telecmi.com' },
            { 'urls': 'stun:stun.ekiga.net' }
        ]
        this.piopiyOption.debug = ( isBoolean( option.debug ) ) ? option.debug : false;
        this.piopiyOption.autoplay = isBoolean( option.autoplay ) ? option.autoplay : true;
        this.piopiyOption.autoReboot = isBoolean( option.autoReboot ) ? option.autoReboot : true;
        this.piopiyOption.ringTime = isNumber( option.ringTime ) ? option.ringTime : 60;
        this.piopiyOption.displayName = isString( option.name ) ? option.name : null;

        if ( this.piopiyOption.autoplay ) {

            cmiAudio.audioTag();
        }


    }



    login ( user_id, password ) {

        let _this = this;
        if ( isString( user_id ) && isString( password ) ) {
            var credentials = {
                uri: user_id + '@sbc.telecmi.com',
                authorization_user: user_id,
                password: password,
                debug: this.piopiyOption.debug,
                display_name: this.piopiyOption.displayName,
                no_answer_timeout: this.piopiyOption.ringTime,
                register: true,
                register_expires: 300,
                connection_recovery_min_interval: 2,
                connection_recovery_max_interval: 3,
                session_timers: false
            }

            userAgent.start( credentials, _this );
        } else {
            throw new Error( "invalid user_id or password" );
        }
    }


    logout () {
        let _this = this;
        userAgent.stop( _this );
    }

    call ( to ) {
        let _this = this;
        if ( !isString( to ) ) {
            _this.emit( 'error', { code: 1002, status: 'Invalid type to call' } )
            return;
        }

        userAgent.make( to, _this );
    }

    terminate () {
        let _this = this;
        userAgent.terminate( _this );
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

    onHold () {
        let _this = this;
        return userAgent.onhold( _this );
    }

    onMute () {
        let _this = this;
        return userAgent.onmute( _this );
    }

}


