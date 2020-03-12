
import _ from 'lodash';
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




        this.piopiyOption.debug = ( _.isBoolean( option.debug ) ) ? option.debug : false;
        this.piopiyOption.autoplay = _.isBoolean( option.autoplay ) ? option.autoplay : true;
        this.piopiyOption.autoReboot = _.isBoolean( option.autoReboot ) ? option.autoReboot : true;
        this.piopiyOption.ringTime = _.isNumber( option.ringTime ) ? option.ringTime : 60;
        this.piopiyOption.displayName = _.isString( option.name ) ? option.name : null;

        if ( this.piopiyOption.autoplay ) {

            cmiAudio.audioTag();
        }


    }



    login ( user_id, password ) {

        let _this = this;
        if ( _.isString( user_id ) && _.isString( password ) ) {
            var credentials = {
                uri: user_id + '@sbc.telecmi.com',
                authorization_user: user_id,
                password: password,
                debug: this.piopiyOption.debug,
                display_name: this.piopiyOption.displayName,
                no_answer_timeout: this.piopiyOption.ringTime,
                register: true,
            }
            console.log( credentials )
            userAgent.start( credentials, _this );
        } else {
            throw new Error( "invalid user_id or password" );
        }
    }


    logout () {
        userAgent.stop();
    }

    call ( to ) {
        let _this = this;
        if ( !_.isString( to ) ) {
            _this.emit( 'error', { code: 1002, status: 'Invalid type to call' } )
            return;
        }

        userAgent.make( to, _this );
    }

    terminate () {
        let _this = this;
        userAgent.terminate( _this );
    }

    hangup () {
        let _this = this;
        userAgent.hangup( _this );
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


}


