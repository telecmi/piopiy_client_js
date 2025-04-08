import io from 'socket.io-client';


class SocketCMI {

    constructor( token, _this ) {


        this.socket = io( 'https://notify.telecmi.com', {
            query: { token: token }
        } );

        // this.socket = io( 'http://localhost:8181', {
        //     query: { token: token }
        // } );








        this.socket.on( 'disconnect', ( reson ) => {
            _this.ready_transfer = false;
            console.log( 'disconnect', reson );
            if ( reson == 'transport close' ) {
                _this.emit( 'net_changed', { code: 400, msg: 'network changed' } )
            }
        } );

        this.socket.on( "connect_error", () => {

            _this.ready_transfer = false;
        } );

        this.socket.on( 'connect', () => {

            _this.ready_transfer = true;
            this.socket.emit( 'wssip-agent-opt', { join: true } )
        } );

        this.socket.on( 'cmi_transfer', ( data ) => {

            if ( data.state == 'init' ) {
                _this.sendDtmf( "*9" );
            }
            _this.emit( 'transfer', data )
        } );

        this.socket.on( 'force_logout', ( data ) => {
            console.log( _this )
            _this.logout();
            _this.emit( 'sbc_logout', data );
        } );

        this.socket.on( 'cmi_record', ( data ) => {

            _this.emit( 'record', data )
        } );



    }

    transfer ( uuid, to ) {


        if ( this.socket.connected ) {
            this.socket.emit( 'agent-call-transfer', { uuid: uuid, to: to } )
        }

    }

    cancel ( uuid ) {
        this.socket( 'agent-cancel-transfer', { uuid: uuid } )
    }



}

export { SocketCMI }