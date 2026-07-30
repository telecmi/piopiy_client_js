// Stage the `piopiy-native` npm package from the shared piopiyjs build.
//
// One codebase, two published packages:
//   • piopiyjs      — web (root package.json)
//   • piopiy-native — React Native (this script generates it)
//
// Both consume the SAME src/lib; they differ only in package.json (name, entry,
// deps). The version is synced from the root package.json so a single bump ships
// both. Run:  npm run stage:native   then:  cd native-pkg && npm publish
import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'native-pkg');
const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

if (!existsSync(join(root, 'lib', 'index.native.js'))) {
  console.error('lib/ not built — run `npm run build-node` first.');
  process.exit(1);
}

// Fresh staging dir.
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// Files the RN package ships (no web `dist/` bundle; RN-specific docs).
const copy = [
  'lib',
  'index.d.ts',
  'LICENSE.md',
  'CHANGELOG.md',
  'README.react-native.md',
  'README.react-native-ios.md',
  'README.react-native-android.md',
  'README.push-notifications.md',
];
for (const f of copy) {
  const src = join(root, f);
  if (existsSync(src)) cpSync(src, join(out, f), { recursive: true });
}
// The RN landing page is the package's README.
cpSync(join(root, 'README.react-native.md'), join(out, 'README.md'));

// Android-push side-effect entry: `import '@telecmi/piopiy-native/android-push'`.
// Platform-split so the require('@react-native-firebase/messaging') exists ONLY
// in Android bundles — Metro picks .android.js there and the empty .ios.js on
// iOS, keeping Firebase entirely out of iOS bundles even when installed.
writeFileSync(join(out, 'android-push.android.js'),
`// Enables Android push (FCM). Import ONCE, before constructing PIOPIY:
//   import '@telecmi/piopiy-native/android-push';
// Requires @react-native-firebase/app + /messaging installed in YOUR app
// (they are the app's own Firebase project — see the Android setup guide).
var mod = require('@react-native-firebase/messaging');
require('./lib/messagingRegistry').setMessaging(mod && (mod.default || mod));
`);
writeFileSync(join(out, 'android-push.ios.js'),
`// iOS build: intentionally empty. iOS push uses PushKit natively — Firebase
// never enters the iOS bundle (this file is what Metro resolves on iOS).
module.exports = {};
`);
writeFileSync(join(out, 'android-push.d.ts'),
`// Side-effect import that enables Android push (FCM). See the Android guide.
export {};
`);

const nativePkg = {
  name: '@telecmi/piopiy-native',
  title: 'PIOPIY WebRTC SDK for React Native (iOS & Android)',
  version: rootPkg.version, // synced from @telecmi/piopiyjs — bump once, ship both
  publishConfig: { access: 'public' }, // scoped packages default to private
  description:
    'Official PIOPIY WebRTC SDK for React Native — high-quality voice calls, ' +
    'CallKit/ConnectionService, and push wake-ups on iOS and Android.',
  main: 'lib/index.native.js',
  'react-native': 'lib/index.native.js',
  types: 'index.d.ts',
  files: [
    'lib',
    'index.d.ts',
    'android-push.android.js',
    'android-push.ios.js',
    'android-push.d.ts',
    'README.md',
    'README.react-native.md',
    'README.react-native-ios.md',
    'README.react-native-android.md',
    'README.push-notifications.md',
    'LICENSE.md',
    'CHANGELOG.md',
  ],
  scripts: {},
  repository: rootPkg.repository,
  keywords: [...(rootPkg.keywords || []), 'react-native', 'callkit', 'ios', 'android'],
  author: rootPkg.author,
  license: rootPkg.license,
  bugs: rootPkg.bugs,
  homepage: rootPkg.homepage,
  // Shared runtime + the bundled WebRTC/LiveKit engine ("ships its own engine").
  // Pin the bundled engine to the tested major versions. An open range let a
  // fresh install pull @livekit/react-native-webrtc 144.x, whose iOS audio
  // session defaults differ from 125.x — every call answered on loudspeaker.
  dependencies: {
    ...rootPkg.dependencies,
    // These two are a matched pair — @livekit/react-native 2.12+ requires the
    // 144.x engine, whose iOS audio defaults route every call to the
    // loudspeaker. Keep both on the tested 2.8 / 125.x line.
    '@livekit/react-native': '~2.8.0',
    '@livekit/react-native-webrtc': '~125.0.12',
    'livekit-client': '^2.15.0',
    // Our CallKeep: upstream 4.3.16 + the duplicate-@ReactMethod fix (Android
    // crash on RN 0.76+). Bundled so apps neither install nor patch CallKeep.
    '@telecmi/react-native-callkeep': '4.3.16',
    // Audio routing and iOS VoIP push — required for calls, so they ship with
    // the SDK like everything else. Apps register them in react-native.config.js
    // (transitive deps aren't autolinked otherwise) and install nothing.
    'react-native-incall-manager': '^4.2.2',
    'react-native-voip-push-notification': '^3.3.3',
  },
  // The app provides only React Native itself. (@react-native-firebase stays an
  // app install: Android-only, needs the app's google-services.json + gradle
  // plugin regardless, and its version should track the app's RN release.)
  peerDependencies: {
    'react-native': '>=0.60.0',
  },
};

// The gate runs on `npm publish` from native-pkg/ too — a publish that hasn't
// proven the tarball bundles in the real example app must not reach customers.
nativePkg.scripts = { prepublishOnly: 'cd .. && ./scripts/verify-example.sh' };

writeFileSync(join(out, 'package.json'), JSON.stringify(nativePkg, null, 2) + '\n');

console.log(`Staged piopiy-native@${nativePkg.version} in ./native-pkg`);
console.log('Publish with:  cd native-pkg && npm publish');
