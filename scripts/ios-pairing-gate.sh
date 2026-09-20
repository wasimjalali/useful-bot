#!/usr/bin/env bash
# The PR-2 live gate (spec 17.3): drives PairingFlowUITests through a real
# dev-path pairing lifecycle against the running stack — pair, sign out, sign
# in, revoke, rotate, re-pair. The test bundle cannot touch the host
# credential store, so the legs are separate xcodebuild invocations and the
# phone credential flips between them.
#
# Prereqs: the dev stack running (npm run web:dev + router/eve), a phone
# credential enrolled (setup-local.mjs --pair-phone), a booted iOS sim.
# Usage: SIM_ID=<device-udid> scripts/ios-pairing-gate.sh
#   XCB overrides the xcodebuild binary; SIM_NAME/OS select the destination
#   when SIM_ID is unset.

set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
# The pair file below holds a live device token; nothing it or the nohup
# logs create should be world-readable.
umask 077
NODE=/usr/local/bin/node
XCB="${XCB:-xcodebuild}"
SIM_ID="${SIM_ID:-}"
if [ -n "$SIM_ID" ]; then
  DEST="platform=iOS Simulator,id=$SIM_ID"
else
  DEST="platform=iOS Simulator,name=${SIM_NAME:-iPhone 17},OS=${SIM_OS:-latest}"
fi

# Password autofill suppression: a typed SecureField submission fires
# Keychain's "Save Password?" sheet asynchronously, and it has shipped in
# gate shots. The allowPasswordAutoFill restrictedBool payload is the
# headless equivalent of Settings > Passwords > AutoFill off; write it
# while the sim is shut down so the settings daemon reads it cold, then
# boot it back up here — a leg racing the cold boot dies with
# "Mach error -308" before the first test line.
sim_udid() {
  if [ -n "$SIM_ID" ]; then printf '%s' "$SIM_ID"; return; fi
  xcrun simctl list devices available -j | /usr/bin/python3 - "${SIM_NAME:-iPhone 17}" <<'PY'
import json, sys
name = sys.argv[1]
for runtime, devs in json.load(sys.stdin)["devices"].items():
    if "iOS" not in runtime:
        continue
    for d in devs:
        if d["name"] == name:
            print(d["udid"]); sys.exit(0)
sys.exit("no iOS sim named %r" % name)
PY
}

disable_password_autofill() {
  local udid dev
  udid=$(sim_udid)
  dev="$HOME/Library/Developer/CoreSimulator/Devices/$udid"
  xcrun simctl shutdown "$udid" 2>/dev/null || true
  for _ in $(seq 1 40); do
    xcrun simctl list devices -j | /usr/bin/python3 -c "
import json,sys
for devs in json.load(sys.stdin)['devices'].values():
    for d in devs:
        if d.get('udid')=='$udid' and d.get('state')=='Shutdown': sys.exit(0)
sys.exit(1)" && break
    sleep 0.5
  done
  for plist in \
    "$dev/data/Containers/Shared/SystemGroup/systemgroup.com.apple.configurationprofiles/Library/ConfigurationProfiles/UserSettings.plist" \
    "$dev/data/Library/UserConfigurationProfiles/EffectiveUserSettings.plist" \
    "$dev/data/Library/UserConfigurationProfiles/PublicInfo/PublicEffectiveUserSettings.plist"; do
    mkdir -p "$(dirname "$plist")"
    /usr/bin/python3 - "$plist" <<'PY'
import plistlib, sys, os
path = sys.argv[1]
if os.path.exists(path):
    with open(path, "rb") as f: d = plistlib.load(f)
else:
    d = {}
d.setdefault("restrictedBool", {}).setdefault("allowPasswordAutoFill", {})["value"] = False
with open(path, "wb") as f: plistlib.dump(d, f)
PY
  done
  # Cold-boot now and let launchd settle: the first leg must find a device
  # that is up, not one still starting.
  xcrun simctl boot "$udid" 2>/dev/null || true
  for _ in $(seq 1 60); do
    xcrun simctl list devices -j | /usr/bin/python3 -c "
import json,sys
for devs in json.load(sys.stdin)['devices'].values():
    for d in devs:
        if d.get('udid')=='$udid' and d.get('state')=='Booted': sys.exit(0)
sys.exit(1)" && break
    sleep 0.5
  done
  sleep 5
}
disable_password_autofill

PAIR_FILE=/tmp/ub-pair.json
REVOKED_FLAG=/tmp/ub-pair-revoked
WEB_DOWN_FLAG=/tmp/ub-web-down
EVE_DOWN_FLAG=/tmp/ub-eve-down
STUB_UP_FLAG=/tmp/ub-stub-up
STUB_PORT=59999
STUB_PID=""
WEB_PID=""
EVE_KILLED=""

payload() {
  # --print-pairing answers {"error":"not_paired"} on a dead credential —
  # that still matches '^{', so require the real shape.
  "$NODE" scripts/setup-local.mjs --print-pairing --host http://127.0.0.1:4320 \
    | grep '^{' | head -1 | grep '"token"'
}

leg() {
  local test_name="$1"
  local class="${2:-PairingFlowUITests}"
  echo "--- leg $class/$test_name"
  "$XCB" \
    -project ios/UsefulBot.xcodeproj -scheme UsefulBot \
    -destination "$DEST" \
    -only-testing:"UsefulBotUITests/$class/$test_name" \
    test
}

cleanup() {
  rm -f "$PAIR_FILE" "$REVOKED_FLAG" "$WEB_DOWN_FLAG" "$EVE_DOWN_FLAG" "$STUB_UP_FLAG"
  [ -n "$STUB_PID" ] && kill "$STUB_PID" 2>/dev/null || true
  [ -n "$EVE_KILLED" ] && start_eve || true
}
trap cleanup EXIT

# The stall stub: accepts loopback connections and never answers, so the
# session exchange holds the "Connecting" state long enough to capture.
start_stub() {
  "$NODE" -e "require('net').createServer(s=>s.on('data',()=>{})).listen($STUB_PORT,'127.0.0.1')" &
  STUB_PID=$!
  touch "$STUB_UP_FLAG"
  sleep 0.3
}

# The readiness banner needs a paired app whose Mac stops answering: drop
# the web service (:4320), run the leg, bring it back. The running dev
# process carries UB_* secrets in its env — capture them first so the
# restart keeps the provider session alive.
UB_ENV=""
capture_web_env() {
  local pid
  pid=$(lsof -ti tcp:4320 -sTCP:LISTEN | head -1)
  [ -z "$pid" ] && return 0
  pid=$(ps -o ppid= -p "$pid" | tr -d ' ')
  UB_ENV=$(ps eww -p "$pid" | tr ' ' '\n' | grep '^UB_' | tr '\n' ' ')
}

stop_web() {
  capture_web_env
  WEB_PID=$(lsof -ti tcp:4320 -sTCP:LISTEN | head -1)
  [ -n "$WEB_PID" ] && kill "$WEB_PID" 2>/dev/null || true
  for _ in $(seq 1 20); do
    lsof -ti tcp:4320 -sTCP:LISTEN >/dev/null 2>&1 || break
    sleep 0.5
  done
  touch "$WEB_DOWN_FLAG"
}

start_web() {
  (cd "$ROOT" && env $UB_ENV UB_ROUTER_CONFIG="${UB_ROUTER_CONFIG:-$HOME/.useful-bot/config.json}" \
    nohup npm run web:dev >/tmp/ub-web.log 2>&1 &)
  for _ in $(seq 1 90); do
    lsof -ti tcp:4320 -sTCP:LISTEN >/dev/null 2>&1 && break
    sleep 1
  done
  rm -f "$WEB_DOWN_FLAG"
}

# Runtime-down banner: web stays up but its eve probe (:4321) must fail, so
# kill the whole eve chain (service.mjs supervisor exits with its child —
# kill supervisor + eve.js + listener). Same env-capture dance as web.
EVE_ENV=""
stop_eve() {
  local sup pid
  sup=$(pgrep -f "service.mjs eve" | head -1)
  [ -n "$sup" ] && EVE_ENV=$(ps eww -p "$sup" | tr ' ' '\n' | grep '^UB_' | tr '\n' ' ')
  pid=$(lsof -ti tcp:4321 -sTCP:LISTEN | head -1)
  [ -n "$sup" ] && kill "$sup" 2>/dev/null || true
  pkill -f "eve.js dev" 2>/dev/null || true
  [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 20); do
    lsof -ti tcp:4321 -sTCP:LISTEN >/dev/null 2>&1 || break
    sleep 0.5
  done
  touch "$EVE_DOWN_FLAG"
  EVE_KILLED=1
}

start_eve() {
  (cd "$ROOT" && env $EVE_ENV UB_ROUTER_CONFIG="${UB_ROUTER_CONFIG:-$HOME/.useful-bot/config.json}" \
    nohup /usr/local/bin/node scripts/service.mjs eve >/tmp/ub-eve.log 2>&1 &)
  for _ in $(seq 1 90); do
    lsof -ti tcp:4321 -sTCP:LISTEN >/dev/null 2>&1 && break
    sleep 1
  done
  rm -f "$EVE_DOWN_FLAG"
  EVE_KILLED=""
}

# The enrolled credential is the fixture: pair if nothing is live yet.
if ! payload >/dev/null 2>&1; then
  echo "no live phone credential — enrolling (--pair-phone)"
  "$NODE" scripts/setup-local.mjs --pair-phone --host http://127.0.0.1:4320
fi

# Leg A: pair, sign out, sign in — against the live credential.
payload > "$PAIR_FILE"
leg testA_PairAndSessionLifecycle

# The 600 ms "Connected to <name>" success line needs UB_HOLD_CONNECTED to
# hold it still for the visual gate; pairs fresh, so it wants a live token.
leg testConnectedPairScreen ShotsUITests
leg testConnectedPairScreenAccessibility ShotsUITests

# Between legs: revoke. Relaunched, the stored token is a terminal 401.
"$NODE" scripts/setup-local.mjs --revoke-phone >/dev/null
touch "$REVOKED_FLAG"
leg testB_RevokedCredentialInvalidates
leg testCredentialInvalidDark ShotsUITests
rm -f "$REVOKED_FLAG"

# Rotate mints a fresh token (and re-enables phone access); leg C re-pairs it.
"$NODE" scripts/setup-local.mjs --rotate-phone >/dev/null
payload > "$PAIR_FILE"
leg testC_RePairAfterRotation
leg testRepairedDark ShotsUITests

# Loading/empty list states: env seams hold or empty the roster fetch; the
# app stays paired underneath either way.
leg testBotsLoading ShotsUITests
leg testBotsEmpty ShotsUITests
leg testBotsLoadError ShotsUITests
leg testBotsLoadErrorAccessibility ShotsUITests
# §11's fourth banner row: the credential expiry override puts the pairing
# inside the seven-day window for the one-time "Pairing expires" banner.
leg testExpiryBanner ShotsUITests

# Visual-gate legs while the pairing + payload are still live: the paired
# journey (Bots, Devices, sign out, sign in) in dark and at XXXL.
leg testJourneyLight ShotsUITests
leg testJourneyDark ShotsUITests
leg testJourneyAccessibilityLight ShotsUITests
leg testJourneyAccessibilityDark ShotsUITests

# Readiness banners: the paired app is left on the sim from the journeys.
# No network first (UB_OFFLINE pins the monitor), then web down for "Your
# Mac is unreachable" — and inside that window, the signed-out error and
# offline shots (sign-out is offline-pure by spec). Resign before eve-down
# so the runtime-down leg still launches a paired app.
leg testOfflineBanner ShotsUITests
stop_web
leg testMacUnreachableBanner ShotsUITests
leg testSignedOutStates ShotsUITests
start_web
leg testResignIn ShotsUITests
stop_eve
leg testRuntimeDownBanner ShotsUITests
start_eve

# Connecting / failed states: the stall stub holds the exchange open, then
# a dead loopback port fails it. No live credential needed.
start_stub
leg testConnectingBothAppearances ShotsUITests
kill "$STUB_PID" 2>/dev/null || true
STUB_PID=""
rm -f "$STUB_UP_FLAG"
leg testConnectFailedBothAppearances ShotsUITests

# Offline pairing screen: "You're offline" + disabled-with-reason chrome.
leg testOfflinePairing ShotsUITests

rm -f "$PAIR_FILE"

echo "pairing gate: all legs passed"
