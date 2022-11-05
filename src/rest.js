import axios from 'axios';

export default class {

    getToken ( user_id, password, callback ) {

        axios( { url: 'https://piopiy.telecmi.com/v1/agentLogin', method: 'post', data: { id: user_id, password: password }, timeout: 5000 } ).then( async ( res ) => {

            if ( res.data.code === 200 ) {
                callback( { code: 200, token: res.data.token } )
            } else {
                callback( { code: 407 } )
            }
        } ).catch( ( error ) => {
            callback( { code: 407 } )
        } );
    }

}

