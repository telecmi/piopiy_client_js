// return the user data from the session storage
export const getUser = async () => {
    const userStr = await localStorage.getItem( 'user' );
    if ( userStr ) return JSON.parse( userStr );
    else return null;
}

// return the token from the session storage
export const getToken = () => {
    return localStorage.getItem( 'token' ) || null;
}

// remove the token and user from the session storage
export const removeUserSession = async () => {
    await localStorage.removeItem( 'token' );
    await localStorage.removeItem( 'user' );
}

// set the token and user from the session storage
export const setUserSession = async ( token, user ) => {

    localStorage.setItem( 'token', token );
    localStorage.setItem( 'user', JSON.stringify( user ) );
    return true;
}


// set the token and user from the session storage
export const setStatus = ( status ) => {

    localStorage.removeItem( 'user_status' );
    localStorage.setItem( 'user_status', status );

}

export const getStatus = () => {
    return localStorage.getItem( 'user_status' );
}

