import { toast } from 'react-toastify';



export const errorNotify = ( msg ) => {

    toast.dismiss();
    toast.error( msg, {
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: true,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        pauseOnFocusLoss: false,
        theme: 'colored',
    } );
}

export const errorNotifyLong = ( msg ) => {

    toast.dismiss();
    toast.error( msg, {
        position: "top-center",
        autoClose: 2000,
        hideProgressBar: true,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        pauseOnFocusLoss: false,
        theme: 'colored',
    } );
}

export const successNotifyLong = ( msg ) => {

    toast.dismiss();
    toast.success( msg, {
        position: "top-center",
        autoClose: 2000,
        hideProgressBar: true,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        pauseOnFocusLoss: false,
        theme: 'colored',

    } );
}

export const permissionNotify = ( msg ) => {

    toast.dismiss();
    toast.error( msg, {
        position: "top-center",
        autoClose: 4000,
        hideProgressBar: true,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        pauseOnFocusLoss: false,
        theme: 'colored',
    } );
}

const id = '';

export const offlineInfo = ( msg ) => {


    toast.loading( msg, {
        toastId: "customId",
        theme: "colored",
        position: "bottom-right",
        containerId: "home_toast",
        type: 'error'
    } )
}


export const onlineInfo = ( msg ) => {
    toast.update( "customId", { render: msg, type: "success", containerId: "home_toast", isLoading: false } );
    toast.dismiss( "customId" );

}

export const closeNotify = ( msg ) => {
    toast.dismiss( "customId" );

}