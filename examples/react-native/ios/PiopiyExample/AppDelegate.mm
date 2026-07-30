#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>

#import "RNVoipPushNotificationManager.h"
#import "RNCallKeep.h"
#import <PushKit/PushKit.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"PiopiyExample";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  // Native CallKeep setup so Answer/End taps that happen before the React
  // Native bridge is ready are queued and replayed to JS after launch.
  [RNCallKeep setup:@{
    @"appName": @"PiopiyExample",
    @"supportsVideo": @NO,
  }];

  // Register for VoIP push (PushKit). This is what makes iOS issue the VoIP
  // token, which the SDK then registers with TeleCMI automatically.
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

// iOS issued/updated the VoIP token -> forward to JS. The SDK picks it up and
// registers it with TeleCMI (autoPushToken); the app writes no token code.
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
  NSString *caller = payload.dictionaryPayload[@"from"] ?: payload.dictionaryPayload[@"caller"] ?: @"Incoming call";
  // Team/queue name from the push ("team") — shown as part of the caller
  // display on the CallKit screen: "+91… — Support". The handle stays the
  // bare number so call-back and recents keep working.
  NSString *team = payload.dictionaryPayload[@"team"];
  NSString *callerDisplay = ([team isKindOfClass:[NSString class]] && team.length > 0)
      ? [NSString stringWithFormat:@"%@ \u2014 %@", caller, team]
      : caller;
  // {type:"cancel_call"} — the caller hung up while this device was ringing.
  BOOL isCancel = [payload.dictionaryPayload[@"type"] isEqual:@"cancel_call"];

  // Keep the JS thread scheduled long enough to connect the call on a locked
  // device; otherwise iOS suspends it right after the push.
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
    // Report (iOS 13+ requires it for EVERY VoIP push) then end inside the
    // completion, dismissing the still-ringing call of the same uuid.
    // 2 = CXCallEndedReasonRemoteEnded.
    [RNCallKeep reportNewIncomingCall:uuid
                               handle:caller
                           handleType:@"generic"
                             hasVideo:NO
                  localizedCallerName:callerDisplay
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
                  localizedCallerName:callerDisplay
                      supportsHolding:YES
                         supportsDTMF:NO
                     supportsGrouping:NO
                   supportsUngrouping:NO
                          fromPushKit:YES
                              payload:payload.dictionaryPayload
                withCompletionHandler:completion];
    // Native ring-timeout backstop, a few seconds above the SDK's ringTime
    // (40 s). iOS can park the JS thread after a background wake, so only a
    // native timer is guaranteed to fire if the device also went offline.
    // 3 = CXCallEndedReasonUnanswered (logged as a missed call).
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
