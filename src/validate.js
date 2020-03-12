import _ from 'lodash';


export default class {


    isObject ( obj ) {
        try {
            if ( obj && typeof obj === 'object' && obj !== null ) {
                return true;
            }
        } catch ( err ) {

        }
        return false;
    }

} 