// import Dialpad from "./tabs/Dialpad";
import { withStyles } from "@mui/material/styles";
import React from "react";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";

import PIOPIY from "./lib/index";
import {
  piopiy_start,
  answer,
  reject,
  make_call,
  terminate,
  dtmf,
  hold,
  unhold,
  mute,
  unmute,
  reRegister,
  transfer,
  merge,
  cancel_transfer
} from "./service/piopiy_voice";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import _ from "underscore";

// import homeStyles from "./App.css";

class Web extends React.Component {
  constructor( props ) {
    super( props );

    this.state = {
      dialed_number: "",
      feed_call_details: {},
      cmi_agents: [],
      dialState: "Trying",
      dialpad: false,
      current_network_status: true,
      customerName: null,
      toNumber: null,
      note_number: null,
      dialToNumber: null,
      call: true
    };

    let _this = this;



    this.makeCall = () => {
      var dial_number = parseInt( this.state.dialed_number );
      make_call( this, dial_number.toString() );
      this.setState( { call: false } )
    };

    this.hangUp = () => {
      terminate( this )
      this.setState( { call: true } )
    }


  }

  componentWillUnmount () {

    this._isMounted = false;
    // stop( this );

    clearInterval();
  }

  componentDidMount () {
    this._isMounted = true;

    this.piopiy = new PIOPIY( { name: "TeleCMI", debug: false, autoplay: true, ringTime: 60 } );


    piopiy_start( this );

  }

  render () {
    // const { classes } = this.props;

    return (
      <Box style={{ display: "flex", justifyContent: "center", height: '100vh', alignItems: 'center' }}>
        <TextField onChange={( e ) => this.setState( { dialed_number: e.target.value } )} id="standard-basic" label="Enter the Number" variant="standard" />
        {this.state.call ? <Button onClick={() => this.makeCall()} style={{ background: '#77bf49' }} variant="contained">Call</Button> :
          <Button onClick={() => this.hangUp()} style={{ background: '#e84c3d', marginLeft: '16px' }} variant="contained">Hang Up</Button>}
      </Box>
    );
  }
}

export default Web;
