package io.wazo.callkeep;

public class Constants {
    public static final String ACTION_ANSWER_CALL = "ACTION_ANSWER_CALL";
    public static final String ACTION_AUDIO_SESSION = "ACTION_AUDIO_SESSION";
    public static final String ACTION_CHECK_REACHABILITY = "ACTION_CHECK_REACHABILITY";
    public static final String ACTION_DTMF_TONE = "ACTION_DTMF_TONE";
    public static final String ACTION_END_CALL = "ACTION_END_CALL";
    public static final String ACTION_HOLD_CALL = "ACTION_HOLD_CALL";
    public static final String ACTION_MUTE_CALL = "ACTION_MUTE_CALL";
    public static final String ACTION_ONGOING_CALL = "ACTION_ONGOING_CALL";
    public static final String ACTION_UNHOLD_CALL = "ACTION_UNHOLD_CALL";
    public static final String ACTION_UNMUTE_CALL = "ACTION_UNMUTE_CALL";
    public static final String ACTION_WAKE_APP = "ACTION_WAKE_APP";
    public static final String ACTION_SHOW_INCOMING_CALL_UI = "ACTION_SHOW_INCOMING_CALL_UI";
    public static final String ACTION_ON_SILENCE_INCOMING_CALL = "ACTION_ON_SILENCE_INCOMING_CALL";
    public static final String ACTION_ON_CREATE_CONNECTION_FAILED = "ACTION_ON_CREATE_CONNECTION_FAILED";
    public static final String ACTION_DID_CHANGE_AUDIO_ROUTE = "ACTION_DID_CHANGE_AUDIO_ROUTE";


    public static final String EXTRA_CALL_NUMBER = "EXTRA_CALL_NUMBER";
    public static final String EXTRA_CALL_NUMBER_SCHEMA = "EXTRA_CALL_NUMBER_SCHEMA";
    public static final String EXTRA_CALL_UUID = "EXTRA_CALL_UUID";
    public static final String EXTRA_CALLER_NAME = "EXTRA_CALLER_NAME";
    public static final String EXTRA_HAS_VIDEO = "EXTRA_HAS_VIDEO";
    // Per-call self-managed flag (independent of hasVideo) so a voice call can
    // be self-managed while video still keys off hasVideo. Plus the React
    // component the ring/in-call surface must mount for this call type.
    public static final String EXTRA_SELF_MANAGED = "EXTRA_SELF_MANAGED";
    public static final String EXTRA_IN_CALL_COMPONENT = "EXTRA_IN_CALL_COMPONENT";
    public static final String EXTRA_PAYLOAD = "EXTRA_PAYLOAD";
    // "contact" | "team" | "video" — how the ring surface labels this call.
    // Video is also derivable from EXTRA_HAS_VIDEO, but team vs contact is
    // only known to the JS side (the SIP X-Team-Name header / the push's
    // `team` field), so it is passed down per call.
    public static final String EXTRA_CALL_KIND = "EXTRA_CALL_KIND";
    // Can't use telecom.EXTRA_DISABLE_ADD_CALL ...
    public static final String EXTRA_DISABLE_ADD_CALL = "android.telecom.extra.DISABLE_ADD_CALL";

    public static final int FOREGROUND_SERVICE_TYPE_MICROPHONE = 128;
}
