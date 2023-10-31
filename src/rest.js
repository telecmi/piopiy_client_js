
export default class {

    getToken ( user_id, password, callback ) {


        var xhr = new XMLHttpRequest();
        xhr.open( 'POST', 'https://rest.telecmi.com/v2/user/login', true );
        xhr.setRequestHeader( 'Content-Type', 'application/json;charset=UTF-8' );
        xhr.timeout = 5000; // Set timeout to 5 seconds

        xhr.onreadystatechange = function () {
            if ( xhr.readyState === 4 ) { // Check if request is complete
                if ( xhr.status === 200 ) {
                    var response = JSON.parse( xhr.responseText );
                    if ( response.code === 200 ) {

                        callback( { code: 200, token: response.token } );
                    } else {
                        callback( { code: 407 } );
                    }
                } else {
                    callback( { code: 407 } );
                }
            }
        };

        xhr.onerror = function () {
            callback( { code: 407 } );
        };

        xhr.ontimeout = function () {
            callback( { code: 407 } );
        };

        var data = {
            id: user_id,
            password: password
        };

        xhr.send( JSON.stringify( data ) );

    }

}

