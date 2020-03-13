

export default class {


    start ( cmi_ua ) {
        if ( !_.isEmpty( cmi_ua ) ) {


            if ( !_.isEmpty( cmi_ua._sessions ) ) {
                cmi_ua.terminateSessions();

            }

            if ( cmi_ua.isRegistered() ) {
                cmi_ua.unregister();
                cmi_ua.stop();
            }



        }


    }

}