


export default class {


    isObject ( obj ) {
        try {
            if ( obj && typeof obj === 'object' && obj !== null ) {
                return true;
            }
        } catch {
            // Ignore error
        }
        return false;
    }

} 