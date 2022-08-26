# PIOPIY Client JS SDK for voice

PIOPIY WebRTC SDK allows you to make and receive voice calls, where making voice calls can be made to a public switched telephone network(PSTN), APP to APP calling and browser to browser calling.  

# Get Started

## Initializing the PIOPIY SDK Object

The PIOPIY SDK object needs to be initialized.

```js
var piopiy = new PIOPIY( {
        name: 'Display Name',
        debug: false,
        autoplay: true,
        ringTime: 60
    } );
```

#### Configuration Parameters

Below is the configuration parameters

| Attribute  | Description                                 | Allowed Values | Default Value |
| ---        | ---                                         | ---            | ---           |
| name       | Your Display Name in App                    | string         | null          |
| debug      | Enable debug message in JS log              | true, false    | false         |
| autoplay   | Enable speaker access to your device        | true, false    | true          |
| ringTime   | Your incoming call ringing time in seconds  | number         | 60            |


## Login

Validate your login ID and password.

```js
piopiy.login('YOUR_LOGIN_ID','YOUR_PASSWORD');
```

#### HTTP status codes

PIOPIY platform represents the following status code to identify the errors.

| Status code | Description                                        |
| ---         | ---                                                |
| 200         | You have Logged in successfully                    |
| 401         | Your Login ID or Password is invalid, Authenication failed |
| 1001        | You have already logged in                         |



## Make call

Make an outbound call to the phone number.

```js
piopiy.call('DESTINATION_PHONE_NUMBER');
```

#### HTTP status codes

PIOPIY platform represents the following status code to identify the errors.

| Status code | Description                                        |
| ---         | ---                                                |
| 100         | Your outbound call status, __status: trying__      |
| 183         | Your Outbound call status, __status: ringing__     |
| 200         | Your Outbound call status, __status: answered, busy, unreachable, call ended__ |
| 1002        | Your already in a call                             |


## Answer call

Answer an incoming call.

```js
piopiy.answer();
```

#### HTTP status codes

PIOPIY platform represents the following status code to identify the errors.

| Status code | Description                                        |
| ---         | ---                                                |
| 183         | Your incoming call status, __status: ringing__     |
| 200         | Your incoming call status, __status: answered, canceled, call ended__ |
| 1002        | Your already in a call                             |


## Reject call

Reject an incoming call.

```js
piopiy.reject();
```

#### HTTP status codes

PIOPIY platform represents the following status code to identify the errors.

| Status code | Description                                        |
| ---         | ---                                                |
| 200         | Your incoming call status, __status: hangup__      |
| 1002        | Currently, there is no ongoing calls               |



## Terminate call

Hangup the ongoing call.

```js
piopiy.terminate();
```

#### HTTP status codes

PIOPIY platform represents the following status code to identify the errors.

| Status code | Description                                        |
| ---         | ---                                                |
| 200         | Your ongoing call status, __status: hangup__       |
| 1002        | Currently, there is no ongoing calls               |


## Send DTMF digit

Send the digits as dtmf. Digits can be any of the following one character strings: "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "*", "#"

```js
piopiy.sendDtmf(DTMF_DIGIT);
```

#### HTTP status codes

PIOPIY platform represents the following status code to identify the errors.

| Status code | Description                                        |
| ---         | ---                                                |
| 200         | DTMF digit received                                |
| 1002        | DTMF not allowed or ongoing call not found         |
| 1005        | Invalid DTMF type                                  |



## Mute Call

Mute an incoming or outgoing call.

```js
piopiy.mute();
```

## Unmute Call

Mute an incoming or outgoing call.

```js
piopiy.unMute();
```

## Hold Call

Mute an incoming or outgoing call.

```js
piopiy.hold();
```

#### HTTP status codes

PIOPIY platform represents the following status code to identify the errors.

| Status code | Description                                                 |
| ---         | ---                                                         |
| 200         | Hold your current call                                      |
| 1002        | Your call is already on hold or there is no call found to hold |


## Unhold Call

Mute an incoming or outgoing call.

```js
piopiy.unHold();
```

#### HTTP status codes

PIOPIY platform represents the following status code to identify the errors.

| Status code | Description                                        |
| ---         | ---                                                |
| 200         | Unhold your current call                           |
| 1002        | First hold a call to unhold it or there is no call found to unhold                   |


## Logout 

Logout 

```js
piopiy.logout();
```

#### HTTP status codes

PIOPIY platform represents the following status code to identify the errors.

| Status code | Description                                        |
| ---         | ---                                                |
| 200         | You have logged out sucessfully                    |
| 1002        | To logout you need to login first                  |
