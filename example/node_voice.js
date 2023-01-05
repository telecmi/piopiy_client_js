var PIOPIY = require( '../lib/index' );


var piopiy = new PIOPIY( {
    name: 'TeleCMI',
    debug: true,
    autoplay: true,
    autoReboot: false,
    ringTime: 60
} );


piopiy.login( 'xxxx', 'xxxx', 'testsbc.telecmi.com' )

piopiy.on( 'login', function ( object ) {
    console.log( object );
} );

piopiy.on( 'logout', function ( object ) {
    console.log( object );
} )

piopiy.on( 'loginFailed', function ( object ) {
    console.log( object );
} )

piopiy.on( 'error', function ( object ) {
    console.log( object );
} )
piopiy.on( 'ended', function ( object ) {
    console.log( object );
} )

piopiy.on( 'rejected', function ( object ) {
    console.log( object );
} )

piopiy.on( 'answered', function ( object ) {
    console.log( object );
} )

piopiy.on( 'hangup', function ( object ) {
    console.log( object );
} )

piopiy.on( 'mediaFailed', function ( object ) {
    console.log( object );
} )

piopiy.on( 'inComingCall', function ( object ) {
    console.log( object );

} )

piopiy.on( 'ringing', ( e ) => {
    console.log( e )
} )

piopiy.on( 'dtmf', ( e ) => {

    console.log( e )

} );

piopiy.on( 'hold', ( e ) => {

    console.log( e )

} );

piopiy.on( 'unhold', ( e ) => {

    console.log( e )

} );

piopiy.on( 'missed', ( e ) => {
    console.log( e )
} )
piopiy.on( 'trying', ( e ) => {
    console.log( e )
} )

piopiy.on( 'callStream', ( e ) => {
    console.log( e )
} )


