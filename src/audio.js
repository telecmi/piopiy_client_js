

export default class {

    audioTag () {

        var audio_tag = document.createElement( "AUDIO" );
        audio_tag.setAttribute( 'autoplay', true );
        audio_tag.setAttribute( 'hidden', true );
        audio_tag.setAttribute( "id", "telecmi_audio_tag" );
        document.body.appendChild( audio_tag );

    }

}