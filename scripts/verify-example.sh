#!/bin/bash
# Pre-release gate: prove the staged native package works in a real app BEFORE
# publishing. Packs native-pkg, installs the tarball into the docs example, and
# runs Metro's bundler for BOTH platforms — the step that catches the entire
# "Requiring unknown module" class (Metro resolves require() statically, so a
# dependency that npm nested or that's missing kills the bundle). Run:
#
#   npm run build-node && npm run stage:native && ./scripts/verify-example.sh
#
# Exits non-zero on any failure. Add ios pods with VERIFY_PODS=1 (slow).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="${VERIFY_APP:-$ROOT/../piopiy_docs_test}"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

cd "$ROOT/native-pkg"
npm pack --pack-destination "$OUT" >/dev/null
TGZ=$(ls "$OUT"/telecmi-piopiy-native-*.tgz)
echo "→ packed $(basename "$TGZ")"

cd "$APP"
npm install "$TGZ" >/dev/null 2>&1
echo "→ installed into $(basename "$APP")"

for platform in ios android; do
  npx react-native bundle --platform "$platform" --dev false \
    --entry-file index.js \
    --bundle-output "$OUT/$platform.jsbundle" \
    --assets-dest "$OUT/assets" >/dev/null
  echo "✓ Metro bundle: $platform ($(wc -c < "$OUT/$platform.jsbundle" | tr -d ' ') bytes)"
done

npx tsc --noEmit && echo "✓ TypeScript clean"

if [ "$VERIFY_PODS" = "1" ]; then
  cd ios
  export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
  bundle install >/dev/null && bundle exec pod install >/dev/null
  echo "✓ pod install"
  cd ..
fi

echo "ALL CHECKS PASSED — safe to publish"
