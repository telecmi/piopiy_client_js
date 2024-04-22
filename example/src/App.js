import React from 'react'
import PIOPIY from "piopiyjs";

class App extends React.Component {
  constructor(props) {
    super(props)

    this.state = {
      answer: false,
      hangup: false,
      phonenumber: '',
      makeCallBtn: true
    }

  }

  componentDidMount() {

    this.piopiy = new PIOPIY({ name: "TeleCMI", debug: false, autoplay: true, ringTime: 60 });
    this.piopiy.login("xxxxxxxxxx", "xxxxxx", "sbcind.telecmi.com");
    this.piopiy_events()

  }

  piopiy_events = () => {

    this.piopiy.on('login', (e) => {
      console.log(e)
    });

    this.piopiy.on('trying', (e) => {
      console.log(e)
    })

    this.piopiy.on('ringing', (e) => {
      console.log(e)
    })

    this.piopiy.on('answered', (e) => {
      this.setState({ answer: false });
      this.setState({ hangup: true });
      console.log(e)
    })

    this.piopiy.on('callStream', (e) => {
      console.log(e)
    })

    this.piopiy.on('inComingCall', (e) => {
      this.setState({ answer: true });
      console.log(e)
    })

    this.piopiy.on('hangup', (e) => {
      this.setState({ hangup: false });
      console.log(e)
    })

    this.piopiy.on('ended', (e) => {
      this.setState({ hangup: false });
      this.setState({ makeCallBtn: true });
      console.log(e)
    })

    this.piopiy.on('hold', (e) => {
      console.log(e)
    });

    this.piopiy.on('unhold', (e) => {
      console.log(e)
    });

    this.piopiy.on('error', (e) => {
      console.log(e)
    })

    this.piopiy.on('logout', (e) => {
      console.log(e)
    })

    this.piopiy.on('rejected', (e) => {
      this.setState({ hangup: false });
      console.log(e)
    })

    this.piopiy.on('mediaFailed', (e) => {
      console.log(e)
    })

    this.piopiy.on('dtmf', (e) => {
      console.log(e)
    });

    this.piopiy.on('transfer', (e) => {
      console.log(e)
    })

    this.piopiy.on('record', (e) => {
      e['record'] = true
    })

    this.piopiy.on('missed', (e) => {
      console.log(e)
    })

    this.piopiy.on('api-cmi-transfer', (e) => {
      this.piopiy.sendDtmf("*9");
    })

    this.piopiy.on('loginFailed', (e) => {
      console.log(e)
    })

  }

  callAnswer = () => {
    this.piopiy.answer()
  }

  callHangup = () => {
    this.setState({ makeCallBtn: true })
    this.piopiy.terminate(this)
  }

  makeCall = () => {
    if (this.state.phonenumber) {
      this.piopiy.call(this.state.phonenumber)
      this.setState({ makeCallBtn: false })
    } else {
      alert('pls enter number')
    }
  }

  render() {
    return (
      <div>
        <h1>TeleCMI PIOPIY React Example</h1>
        <div style={{ padding: '20px' }}>
          {this.state.answer ?
            <button onClick={() => this.callAnswer()}>answer</button> : this.state.hangup &&
            <button onClick={() => this.callHangup()}>hangup</button>
          }
          {this.state.makeCallBtn &&
            <div style={{ paddingTop: '20px' }}>
              <input value={this.state.phonenumber} onChange={(e) => this.setState({ phonenumber: e.target.value })} type="text" name="" id="" placeholder='phone number' />
              <button onClick={() => this.makeCall()}>
                call
              </button>
            </div>
          }
        </div>
      </div>
    )
  }
}

export default App;
