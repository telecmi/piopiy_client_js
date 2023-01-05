
## PIOPIY Client JS SDK for voice

PIOPIY WebRTC SDK allows you to make and receive voice calls, where making voice calls can be made to a public switched telephone network(PSTN), APP to APP calling and browser to browser calling.

## Package Installation 

### Using NPM

```bash
 npm install piopiyjs
```

### Using YARN

```bash
 yarn install piopiyjs
```

### Using Bower

```bash
 bower install telecmi/piopiy_client_js
```


## Monolithic Import

### In Browser

```javascript
 <script src="dist/piopiy.min.js" type="text/javascript"></script>
```

### In ESM/Typescript

```bash
 import PIOPIY from 'piopiyjs';
```

### In CommonJS

```bash
 var PIOPIY = require('piopiyjs');
```

## Initializing the PIOPIY  Object

```javascript
var piopiy = new PIOPIY( {
        name: 'Display Name',
        debug: false,
        autoplay: true,
        ringTime: 60
    } );
```

### Configuration Parameters

Below is the configuration parameters

| Attribute     |      Description                   |  Allowed Values	| Default Value |
|  ---          |    ---                             | ---              | ---           |
| name          | Your Display Name in App	         | string           | none          |
| debug         | Enable debug message in browser console	   | Boolean      | false         |
| autoplay      | Handle media stream automatically	  | Boolean | true          |
| ringTime      | Your incoming call ringing time in seconds | number   | 60            |


## PIOPIY Methods

### Login

Using this method user can able to connect with TeleCMI SBC.

```javascript
piopiy.login('user_id','password','SBC_URI');
```

#### Configuration Parameters


| Parameter Name| Type   |     Description                                                |  
|  ---          |    --- |   ---                                                          | 
| user_id  | string | The user login ID                      | 
| password  | string | The user login Password                              | 
| SBC_URI  | url | <ul><li>ASIA - sbcsg.telecmi.com</li><li>Europe - sbcuk.telecmi.com</li><li>America - sbcus.telecmi.com</li><li>India - sbcind.telecmi.com</li></ul>                    | 

### Make call

Using this method user can able to make call to PSTN or Other user extension.

```javascript
piopiy.call('PHONE_NUMBER');
```


#### Configuration Parameters


| Parameter Name| Type   |     Description                                       |  
|  ---          |    --- |     ---                                               | 
| PHONE_NUMBER  | string |     Enter phone number or user extention number ,Phone number start with country code example '13158050050'         | 

### Send DTMF 

Using this method user can able to send DTMF tone to ongoing call.

```js
piopiy.sendDtmf('DTMF_TONE');
```

#### Configuration Parameters


| Parameter Name| Type   |     Description                                       |  
|  ---          |    --- |   ---                                                 | 
| DTMF_TONE| string | Your DTMF tone input      | 

### Hold Call

Using this method user can able to hold ongoing call.

```js
piopiy.hold();
```

### Unhold Call

Using this method user can able to unhold ongoing call.

```js
piopiy.unHold();
```

### Mute Call

Using this method user can able to mute ongoing call.

```js
piopiy.mute();
```

### Unmute Call

Using this method user can able to unmute ongoing call.

```js
piopiy.unMute();
```

### Answer call

Using this method user can able to answer incoming call.

```js
piopiy.answer();
```


### Reject call

Using this method user can able to reject or disconnect incoming call.

```js
piopiy.reject();
```

### Hangup call

Using this method user can able to hangup ongoing call.

```js
piopiy.terminate();
```

### Logout 
Using this method user can able to logout from SBC session.

```js
piopiy.logout();
```

## PIOPIY Call Event Handler


### Login

This event will triger when user login sucessfully

```js
piopiy.on( 'login', function ( object ) {

    //  Data is JSON it contain event and status.
});
```

#### Example


```js
piopiy.on( 'login', function ( object ) {
       
    if(object.code == 200) {
   
        //  Login successfully and do your stuff here.
        
    }   
});
```

#### List of event and status

| code | status                                      |
| ---  | ---                                         |
| 200  | Login Successfully                          |


### LoginFailed

This event will trigger when user authentication failed.

```js
piopiy.on( 'loginFailed', function ( object ) {

    //  Data is JSON it contain event and status.
});
```

#### Example


```js
 piopiy.on( 'loginFailed', function ( object ) {
       
    if(object.code == 401) {

        //  Verify that the user_id and password are correct. 
    }
});
```

#### List of event and status

| code | status                                      |
| ---  | ---                                         |
| 401  | Invalid user_id or password                 |



### Trying


This event will trigger when user make call to phone number or extention (Destination Number)



```js
piopiy.on( 'trying', function ( object ) {

    //  Data is JSON it contain event and status.
});
```


#### Example

```js
piopiy.on( 'trying', function ( object ) {
        
    if(object.code == 100 ) {

        //  The outgoing call is currently being started.
    }
});
```

#### List of event and status

| code | status   | type    | call_id                              |
|  --- | ---      | ---     | ---                                  |
|  100 | trying   | ougoing | 95ea3424-d77e-123b-0ca1-463d48e96190 |

### Ringing
This event will trigger when call start ringing.

```js
piopiy.on( 'ringing', function ( object ) {

    //  Data is JSON it contain event and status.
});
```
#### Example
```js
piopiy.on( 'ringing', function ( object ) {
        
    if(object.code == 183) {

        // An incoming or outgoing call is ringing.        
    }
});
```
#### List of event and status

|  code | status   | type                | call_id                              |
|  ---  | ---      | ---                 | ---                                  |
|  183  | ringing  | outgoing & incoming | 95ea3424-d77e-123b-0ca1-463d48e96190 |

### Answered
This event will trigger when ongoing call was answered.



```js
piopiy.on( 'answered', function ( object ) {

    //  Data is JSON it contain event and status.
});
```
#### Example

```js
piopiy.on( 'answered', function ( object ) {
        
    if(object.code == 200) {

        // An incoming or outgoing call is answered.
    }
});
```
#### List of event and status

| code | status             | call_id |
| ---  | ---                | --- |
| 200  | answered           | 95ea3424-d77e-123b-0ca1-463d48e96190 |



### CallStream
This event will trigger when mediastream established.
```js
piopiy.on( 'callStream', function ( object ) {

    //  Data is JSON it contain event and status.
});
```


#### Example

```js
piopiy.on( 'callStream', function ( object ) {
          
    // MediaStream has been established.
});
```

#### List of event and status

| code | status             | call_id |
| ---  | ---                | --- |
| 200  | MediaStream        | 95ea3424-d77e-123b-0ca1-463d48e96190 |

### InComingCall
This event will trigger when user recive incmoing call.

```js
piopiy.on( 'inComingCall', function ( object ) {

    //  Data is JSON it contain event and status.
});
```

### Hangup
This event will trigger when user reject or hangup incmoing call.

```js
piopiy.on( 'hangup', function ( object ) {

    //  Data is JSON it contain event and status.
});
```
#### Example

```js
piopiy.on( 'hangup', function ( object ) {
        
    if(object.code == 200 ) {

        //  to hangup the incoming and ongoing calls.
    }
});
```
#### List of event and status

|  code | status   | call_id                                   |
|  ---  | ---      | ---                                    |
|  200  | call hangup  | 95ea3424-d77e-123b-0ca1-463d48e96190      |


### Ended

This event will trigger when ongoing call end.

```js
piopiy.on( 'ended', function ( object ) {

    //  Data is JSON it contain event and status.
});
```


#### Example


```js
piopiy.on( 'ended', function ( object ) {
        
    if(object.code == 200 ) {

        //  An incoming or outgoing call is ended.
    }
});
```

#### List of event and status

| code | status                                      | call_id                              | 
| ---  | ---                                         | ---                                  |
| 200  | call ended , Unavailable , Busy  & Canceled | 95ea3424-d77e-123b-0ca1-463d48e96190 |

### Hold

This event will trigger when ongoing call on hold.

```js
piopiy.on( 'hold', function ( object ) {

    //  Data is JSON it contain event and status.
});
```


#### Example


```js
piopiy.on( 'hold', function ( object ) {
        
    if(object.code == 200 ) {

        //  The call is now being hold.
    }
});
```

#### List of event and status

|  code | status            | whom | call_id |
|  ---  | ---               | --- | --- |
|  200  | call on hold      | myself | 95ea3424-d77e-123b-0ca1-463d48e96190 |




### UnHold

This event will trigger when ongoing call on unhold.


```js
piopiy.on( 'unhold', function ( object ) {

    //  Data is JSON it contain event and status.
});
```


#### Example


```js
piopiy.on( 'unhold', function ( object ) {
        
    if(object.code == 200 ) {

        //  The call is now being released.
    }
});
```

#### List of event and status

|  code | status            | whom  | call_id |
|  ---  | ---               | --- | --- |
|  200  | call on active    | myself | 95ea3424-d77e-123b-0ca1-463d48e96190 |



### Error

This event will trigger when error will occurr.

```js
piopiy.on( 'error', function ( object ) {

    //  Data is JSON it contain event and status.
});
```


#### Example


```js
piopiy.on( 'error', function ( object ) {
        
    if(object.code == 1001 || object.code == 1002) {

        //  If there are any incorrect commands in the function, displays error.
    }
});
```

#### List of event and status

|  code | status            |
|  ---  | ---               |
|  1001 & 1002  | common error    |



### Logout
This event will trigger when user logout .

```js
piopiy.on( 'logout', function ( object ) {

    //  Data is JSON it contain event and status.
});
```


#### Example


```js
piopiy.on( 'logout', function ( object ) {
        
    if(object.code == 200 ) {

        //  The user logged out successfully. 
    }
});
```

#### List of event and status

|  code | status                 |
|  ---  | ---                    |
|  200  | logout successfully    |
