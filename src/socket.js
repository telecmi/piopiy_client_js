import io from 'socket.io-client';


class SocketCMI {

    constructor( token, _this ) {


        this.socket = io( 'https://notify.telecmi.com', {
            query: { token: token }
        } );

        // this.socket = io( 'http://localhost:8181', {
        //     query: { token: token }
        // } );





        const socket = this.socket;


        this.socket.on( 'disconnect', ( reson ) => {
            _this.ready_transfer = false;

        } );

        this.socket.on( "connect_error", ( err ) => {
            _this.ready_transfer = false;
        } );

        this.socket.on( 'connect', () => {
            _this.ready_transfer = true;
            this.socket.emit( 'wssip-agent-opt', { join: true } )
        } );

        this.socket.on( 'cmi_transfer', ( data ) => {


            if ( data.state == 'init' ) {
                _this.emit( 'api-cmi-transfer', data )
            }
            _this.emit( 'transfer', data )
        } );

        this.socket.on( 'cmi_record', ( data ) => {

            _this.emit( 'record', data )
        } );



    }

    transfer ( uuid, to ) {

        if ( this.socket.connected ) {
            this.socket.emit( 'agent-call-transfer', { uuid: uuid, to: to } )
        } else {

        }

    }

    cancel ( uuid ) {
        this.socket( 'agent-cancel-transfer', { uuid: uuid } )
    }



}

export { SocketCMI }