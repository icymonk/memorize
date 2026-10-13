#!/usr/bin/env bash
# E2E (docs/dev/conventions.md 3절): 에뮬레이터용으로 앱을 빌드하고, 에뮬레이터 안에서 Playwright를 돌린다.
# 처음 한 번: pnpm --dir tests/e2e install && pnpm --dir tests/e2e exec playwright install chromium
# (이미 설치된 Chrome을 쓰려면 CHROME_PATH=/path/to/chrome)
set -euo pipefail
cd "$(dirname "$0")/../.."
export NUXT_PUBLIC_USE_EMULATOR=true
export NUXT_PUBLIC_FIREBASE_API_KEY=demo-key
export NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN=localhost
export NUXT_PUBLIC_FIREBASE_PROJECT_ID=demo-memorize
export NUXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-memorize.appspot.com
export NUXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=0
export NUXT_PUBLIC_FIREBASE_APP_ID=demo-app
pnpm functions:build
pnpm generate
pnpm exec firebase emulators:exec --only auth,firestore,functions,storage --project demo-memorize "pnpm --dir tests/e2e test $*"
