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
  dependencies: {
    ...rootPkg.dependencies,
    '@livekit/react-native': '>=2.8.0',
    '@livekit/react-native-webrtc': '>=125.0.0',
    'livekit-client': '>=2.15.0',
  },
  // The app provides these (per the setup docs).
  peerDependencies: {
    'react-native': '>=0.60.0',
    'react-native-callkeep': '>=4.3.0',
    'react-native-incall-manager': '>=4.0.0',
  },
  peerDependenciesMeta: {
    'react-native-callkeep': { optional: true },
    'react-native-incall-manager': { optional: true },
  },
};

writeFileSync(join(out, 'package.json'), JSON.stringify(nativePkg, null, 2) + '\n');

console.log(`Staged piopiy-native@${nativePkg.version} in ./native-pkg`);
console.log('Publish with:  cd native-pkg && npm publish');
