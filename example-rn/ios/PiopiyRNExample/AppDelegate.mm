#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>

#import "RNVoipPushNotificationManager.h"
#import "RNCallKeep.h"
#import <PushKit/PushKit.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"PiopiyRNExample";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  // Set up CallKeep natively so Answer/End actions tapped before the React Native
  // bridge is ready are queued and replayed to JS after launch.
  [RNCallKeep setup:@{
    @"appName": @"PiopiyRNExample",
    @"supportsVideo": @NO,
  }];

  // Register for VoIP push (PushKit). THIS is what makes iOS issue the VoIP token —
  // it triggers pushRegistry:didUpdatePushCredentials: below, which forwards the
  // token to JS (the 'register' event consumed by pushCallService).
  [RNVoipPushNotificationManager voipRegistration];

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

#pragma mark - PushKit (VoIP) — incoming-call wake-ups

// iOS issued/updated the VoIP token → forward it to JS ('register' event).
- (void)pushRegistry:(PKPushRegistry *)registry
didUpdatePushCredentials:(PKPushCredentials *)credentials
             forType:(PKPushType)type
{
  [RNVoipPushNotificationManager didUpdatePushCredentials:credentials forType:(NSString *)type];
}

// A VoIP push arrived (app backgrounded or killed). iOS 13+ REQUIRES reporting a
// CallKit call synchronously here, then we hand the payload to JS.
- (void)pushRegistry:(PKPushRegistry *)registry
didReceiveIncomingPushWithPayload:(PKPushPayload *)payload
             forType:(PKPushType)type
withCompletionHandler:(void (^)(void))completion
{
  NSString *uuid = payload.dictionaryPayload[@"uuid"] ?: [[NSUUID UUID] UUIDString];
  NSString *caller = payload.dictionaryPayload[@"from"] ?: @"Incoming call";
  // Caller hung up while we were ringing: the gateway sends {type:cancel_call}
  // with the SAME uuid as the invite push. iOS 13+ still requires reporting a
  // call for EVERY VoIP push, so report then end natively right away — the
  // ringing CallKit screen (same uuid) is dismissed without waiting for JS.
  BOOL isCancel = [payload.dictionaryPayload[@"type"] isEqual:@"cancel_call"];

  // Hold background execution open so React Native's JS thread keeps RUNNING long
  // enough to re-register and PARSE the incoming SIP INVITE. This is critical on a
  // LOCKED device: otherwise iOS suspends the JS thread right after the push, the
  // single (un-retransmitted) INVITE is never parsed, and answering on the lock
  // screen does nothing until you unlock. The task is ended after the call window.
  UIApplication *app = [UIApplication sharedApplication];
  __block UIBackgroundTaskIdentifier bgTask =
      [app beginBackgroundTaskWithExpirationHandler:^{
        [app endBackgroundTask:bgTask];
        bgTask = UIBackgroundTaskInvalid;
      }];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(25 * NSEC_PER_SEC)),
                 dispatch_get_main_queue(), ^{
    if (bgTask != UIBackgroundTaskInvalid) {
      [app endBackgroundTask:bgTask];
      bgTask = UIBackgroundTaskInvalid;
    }
  });

  if (isCancel) {
    // iOS 13+ requires reporting a call for EVERY VoIP push, so report first,
    // then end INSIDE the completion — the end can never race ahead of the
    // report. This dismisses the still-ringing invite call (same uuid); the
    // duplicate-uuid report itself errors harmlessly.
    // 2 = CXCallEndedReasonRemoteEnded.
    [RNCallKeep reportNewIncomingCall:uuid
                               handle:caller
                           handleType:@"generic"
                             hasVideo:NO
                  localizedCallerName:caller
                      supportsHolding:YES
                         supportsDTMF:NO
                     supportsGrouping:NO
                   supportsUngrouping:NO
                          fromPushKit:YES
                              payload:payload.dictionaryPayload
                withCompletionHandler:^{
      [RNCallKeep endCallWithUUID:uuid reason:2];
      completion();
    }];
  } else {
    [RNCallKeep reportNewIncomingCall:uuid
                               handle:caller
                           handleType:@"generic"
                             hasVideo:NO
                  localizedCallerName:caller
                      supportsHolding:YES
                         supportsDTMF:NO
                     supportsGrouping:NO
                   supportsUngrouping:NO
                          fromPushKit:YES
                              payload:payload.dictionaryPayload
                withCompletionHandler:completion];
    // NATIVE ring timeout backstop (45 s — 5 s behind the SDK's 40 s ringTime,
    // so the JS timer handles the normal case and this only fires when iOS has
    // parked the JS thread). If the device goes offline right after this push,
    // the server's cancel push can never arrive — a native timer keeps ticking;
    // isCallActive is NO while the call is still ringing (and also after it
    // already ended, when endCallWithUUID is a harmless no-op).
    // 3 = CXCallEndedReasonUnanswered → logged as a missed call.
    NSString *ringUuid = [uuid copy];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(45 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
      if (![RNCallKeep isCallActive:ringUuid]) {
        [RNCallKeep endCallWithUUID:ringUuid reason:3];
      }
    });
  }

  [RNVoipPushNotificationManager didReceiveIncomingPushWithPayload:payload forType:(NSString *)type];
}

@end
