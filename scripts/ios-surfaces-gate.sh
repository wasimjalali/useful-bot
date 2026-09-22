#!/usr/bin/env bash
# The PR-3..PR-8 surfaces gate: drives SurfacesUITests against the running
# stack — chat/roster shots, approval-card states, biometrics, widget,
# attachments, settings, proposals, the owner-question card. Pairing is
# banked by ios-pairing-gate.sh first; this driver re-pairs inside the first
# leg if the store lapsed.
#
# Host commands from the test bundle arrive as /tmp/ub-cmd-<name> files;
# this watcher answers /tmp/ub-done-<name>. See SurfacesUITests.swift for
# the command list.
#
# Prereqs: dev stack running, a booted iOS sim. Usage:
#   SIM_ID=<udid> scripts/ios-surfaces-gate.sh [only <TestName> ...]

set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
umask 077
NODE=/usr/local/bin/node
CTL=/tmp/ub-surfaces-ctl.mjs
XCB="${XCB:-xcodebuild}"
SIM_ID="${SIM_ID:-}"
if [ -n "$SIM_ID" ]; then
  DEST="platform=iOS Simulator,id=$SIM_ID"
else
  DEST="platform=iOS Simulator,name=${SIM_NAME:-iPhone 17},OS=${SIM_OS:-latest}"
fi

PAIR_FILE=/tmp/ub-pair.json
STUB_PORT=59996
PROBE_PORT=59998
STUB_PID=""
PROBE_PID=""
WATCHER_PID=""
# set -u: the watcher subshell dereferences this in its kill-guard before any
# train has been spawned — an unbound reference kills the watcher on the
# first bio command, leaving the test's LA sheet without posts.
TRAIN_PID=""
FAILED=""

sim_udid() {
  if [ -n "$SIM_ID" ]; then printf '%s' "$SIM_ID"; return; fi
  local out
  for _ in 1 2 3 4 5; do
    out=$(xcrun simctl list devices available -j 2>/dev/null)
    [ -n "$out" ] && break
    sleep 2
  done
  printf '%s' "$out" | /usr/bin/python3 -c '
import json, sys
name = sys.argv[1]
for runtime, devs in json.load(sys.stdin)["devices"].items():
    if "iOS" not in runtime:
        continue
    for d in devs:
        if d["name"] == name:
            print(d["udid"]); sys.exit(0)
sys.exit("no iOS sim named %r" % name)
' "${SIM_NAME:-iPhone 17}"
}

UDID=$(sim_udid)

start_watcher() {
  (
    while :; do
      for c in /tmp/ub-cmd-*; do
        [ -e "$c" ] || continue
        name="${c##*/tmp/ub-cmd-}"
        # A biometric train keeps posting for ~16 s; if the leg ends first,
        # its leftover posts land inside the NEXT leg's Face ID sheet (a stray
        # match auto-approves a card that expects nomatch). Kill the last
        # train whenever a new bio command or a leg boundary arrives.
        case "$name" in
          biomatch|bionomatch|biocancel|decide-resolve|reseed-*|churn)
            [ -n "$TRAIN_PID" ] && kill "$TRAIN_PID" 2>/dev/null; TRAIN_PID="" ;;
        esac
        case "$name" in
          biomatch)
            # hostCmd blocks on the done marker, so it must be touched when
            # the command is consumed — otherwise the whole post train is
            # spent before the test even taps and the LA sheet mounts to
            # silence. The train runs detached so a match lands whenever the
            # sheet is up. The sim must have Face ID enrolled (Simulator →
            # Features → Face ID → Enrolled) or LA shows a passcode sheet.
            rm -f "$c"; touch "/tmp/ub-done-$name"
            ( for _ in $(seq 1 20); do
                xcrun simctl spawn "$UDID" notifyutil -p com.apple.BiometricKit_Sim.pearl.match >/dev/null 2>&1
                sleep 0.8
              done ) & TRAIN_PID=$! ;;
          bionomatch)
            rm -f "$c"; touch "/tmp/ub-done-$name"
            ( for _ in 1 2 3 4 5 6; do
                xcrun simctl spawn "$UDID" notifyutil -p com.apple.BiometricKit_Sim.pearl.nomatch >/dev/null 2>&1
                sleep 0.8
              done ) & TRAIN_PID=$! ;;
          biocancel)
            # The sim's Face ID sheet only shows Cancel on the "Face Not
            # Recognized" fallback; the nomatch has to land after the LA
            # sheet mounts, so post a train across that window. Extra
            # nomatches against the open fallback are ignored.
            rm -f "$c"; touch "/tmp/ub-done-$name"
            ( for _ in $(seq 1 20); do
                xcrun simctl spawn "$UDID" notifyutil -p com.apple.BiometricKit_Sim.pearl.nomatch >/dev/null 2>&1
                sleep 0.8
              done ) & TRAIN_PID=$! ;;
          decide-resolve)
            "$NODE" "$CTL" decide apr_resolve approve >/dev/null 2>&1
            rm -f "$c"; touch "/tmp/ub-done-$name"
            ( for _ in $(seq 1 20); do
                xcrun simctl spawn "$UDID" notifyutil -p com.apple.BiometricKit_Sim.pearl.match >/dev/null 2>&1
                sleep 0.8
              done ) & TRAIN_PID=$! ;;
          churn)
            "$NODE" "$CTL" churn apr_churn >/dev/null 2>&1 ;;
          reseed-apr_exp)
            "$NODE" "$CTL" seed-approval apr_exp 12 >/dev/null 2>&1 ;;
          reseed-*)
            "$NODE" "$CTL" seed-approval "${name#reseed-}" >/dev/null 2>&1 ;;
          probe-reset)
            echo 0 > /tmp/ub-probe-count ;;
        esac
        rm -f "$c"
        touch "/tmp/ub-done-$name"
      done
      sleep 0.25
    done
  ) &
  WATCHER_PID=$!
}

cleanup() {
  [ -n "$WATCHER_PID" ] && kill "$WATCHER_PID" 2>/dev/null || true
  [ -n "$STUB_PID" ] && kill "$STUB_PID" 2>/dev/null || true
  [ -n "$PROBE_PID" ] && kill "$PROBE_PID" 2>/dev/null || true
  rm -f /tmp/ub-cmd-* /tmp/ub-done-* "$PAIR_FILE"
}
trap cleanup EXIT

payload() {
  "$NODE" scripts/setup-local.mjs --print-pairing --host http://127.0.0.1:4320 \
    | grep '^{' | head -1 | grep '"token"'
}

leg() {
  local test_name="$1"
  local log="/tmp/ub-leg-$test_name.log"
  echo "--- leg $test_name"
  if "$XCB" -project ios/UsefulBot.xcodeproj -scheme UsefulBot \
      -destination "$DEST" \
      -only-testing:"UsefulBotUITests/SurfacesUITests/$test_name" \
      test > "$log" 2>&1; then
    echo "PASS $test_name"
  else
    echo "FAIL $test_name (log $log)"
    FAILED="$FAILED $test_name"
  fi
}

# Fixture control: the question leg needs eve running with the S2 fixture;
# service.mjs rebuilds the child env at spawn, so restarting through it keeps
# the channel secret and provider keys.
stop_eve() {
  pkill -f "service.mjs eve" 2>/dev/null || true
  pkill -f "eve.js dev" 2>/dev/null || true
  local pid
  pid=$(lsof -ti tcp:4321 -sTCP:LISTEN | head -1)
  [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 30); do
    lsof -ti tcp:4321 -sTCP:LISTEN >/dev/null 2>&1 || break
    sleep 0.5
  done
}
start_eve() {
  (cd "$ROOT" && env "$@" nohup /usr/local/bin/node scripts/service.mjs eve >/tmp/ub-eve.log 2>&1 &)
  for _ in $(seq 1 90); do
    lsof -ti tcp:4321 -sTCP:LISTEN >/dev/null 2>&1 && break
    sleep 1
  done
}

if ! payload >/dev/null 2>&1; then
  echo "no live phone credential — enrolling (--pair-phone)"
  "$NODE" scripts/setup-local.mjs --pair-phone --host http://127.0.0.1:4320
fi
payload > "$PAIR_FILE"

# Stub MCP + nav probe for the widget leg.
"$NODE" "$CTL" seed-connections "$STUB_PORT"
"$NODE" "$CTL" mcp-stub "$STUB_PORT" >/tmp/ub-mcp-stub.log 2>&1 &
STUB_PID=$!
"$NODE" "$CTL" probe-server "$PROBE_PORT" >/tmp/ub-probe.log 2>&1 &
PROBE_PID=$!
start_watcher

# A photo in the sim's Photos library for the attachment leg.
[ -f /tmp/ub-photo.png ] || /usr/bin/python3 -c "
import zlib, struct
w=h=400
raw=b''.join(b'\x00'+bytes([120,80,160])*w for _ in range(h))
def chunk(t,d): return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d))
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
open('/tmp/ub-photo.png','wb').write(png)
"
xcrun simctl addmedia "$UDID" /tmp/ub-photo.png >/dev/null 2>&1 || true
# The 64 KB+1 text file for the cap leg.
/usr/bin/python3 -c "open('/tmp/ub-big.txt','w').write('x'*70000)"

ONLY="${*}"
run() { # run <name> — honor the optional "only" filter
  if [ -n "$ONLY" ]; then
    case " $ONLY " in *" $1 "*) ;; *) echo "--- skip $1"; return 0;; esac
  fi
  leg "$1"
}

run testBotsList
run testChat
run testChatAccessibility
run testLongChatPerf
run testPerfColdLaunch
run testPerfChatOpenCached
run testPerfChatOpenColdReplay
run testPerfScroll

# preserveSelection: the phone must never move the Mac's selected bot.
SEL_BEFORE=$("$NODE" -e 'console.log(JSON.parse(require("fs").readFileSync(require("os").homedir()+"/.useful-bot/shell.json","utf8")).selectedBotId??"")')
run testTwoClientPreserveSelection
SEL_AFTER=$("$NODE" -e 'console.log(JSON.parse(require("fs").readFileSync(require("os").homedir()+"/.useful-bot/shell.json","utf8")).selectedBotId??"")')
if [ "$SEL_BEFORE" = "$SEL_AFTER" ]; then
  echo "PASS selectedBotId stable ($SEL_BEFORE)"
else
  echo "FAIL selectedBotId moved $SEL_BEFORE -> $SEL_AFTER"
  FAILED="$FAILED preserveSelection"
fi

# Approval states — each leg seeds its own pending record. Skipped legs
# must not seed: their leftover pending cards stack up behind the one the
# leg under test expects to tap.
seedfor() {
  if [ -n "$ONLY" ]; then case " $ONLY " in *" $1 "*) ;; *) return 0;; esac; fi
  shift; "$NODE" "$CTL" seed-approval "$@"
}
"$NODE" "$CTL" clear-approvals
seedfor testApprovalPending apr_pend
run testApprovalPending
seedfor testApprovalDeny apr_deny
run testApprovalDeny
seedfor testApprovalApprove apr_ok
run testApprovalApprove
seedfor testApprovalBioFailure apr_fail
run testApprovalBioFailure
seedfor testApprovalBioCancel apr_cancel
run testApprovalBioCancel
seedfor testApprovalApproving apr_slow
run testApprovalApproving
seedfor testApprovalResolved apr_resolve
run testApprovalResolved
seedfor testApprovalChanged apr_churn
run testApprovalChanged

# Expired card: clear the store so no other pending card carries buttons,
# then seed a short-TTL pending record — the app must fetch it while it is
# still pending, then watch it lapse into the Expired state (the pending
# list drops expired records, so a card seeded already-expired can never
# render).
"$NODE" "$CTL" clear-approvals
"$NODE" "$CTL" seed-approval apr_exp 12
run testApprovalExpired

run testWidget
echo "widget nav-probe hits: $(cat /tmp/ub-probe-count 2>/dev/null || echo '?')"
run testAttachPhoto
run testTextFileCap
run testSettings
run testRoutineCreate
# The proposal legs share one expanded dock slot with every other ask; clear
# leftovers from earlier legs/reruns, then seed the card under test.
"$NODE" "$CTL" clear-asks
"$NODE" "$CTL" seed-proposal
run testProposalCard
"$NODE" "$CTL" clear-asks
"$NODE" "$CTL" seed-proposal
run testProposalConfirm
"$NODE" "$CTL" clear-asks
"$NODE" "$CTL" seed-connect
run testSafariSheet
"$NODE" "$CTL" clear-asks
"$NODE" "$CTL" seed-connect
run testSafariSheetDark

# Reduce Motion (PR-7): flip the sim's accessibility flag, then re-shot.
xcrun simctl spawn "$UDID" defaults write com.apple.Accessibility ReduceMotionEnabled -bool true 2>/dev/null || true
xcrun simctl spawn "$UDID" notifyutil -p com.apple.accessibility.reducemotion.status.changed >/dev/null 2>&1 || true
run testReduceMotion
xcrun simctl spawn "$UDID" defaults write com.apple.Accessibility ReduceMotionEnabled -bool false 2>/dev/null || true
xcrun simctl spawn "$UDID" notifyutil -p com.apple.accessibility.reducemotion.status.changed >/dev/null 2>&1 || true

# Owner-question leg needs fixture eve; the session script reads the channel
# secret from the running eve child's environment. Only-filtered runs skip it —
# the stamped fixture session would otherwise linger on Test Bot and report
# the bot as working, which disables the composer's send button.
seed_question() {
  stop_eve
  start_eve UB_S2_FIXTURE=1 UB_S2_QUESTION=1
  CHILD=$(pgrep -f "eve.js dev" | head -1)
  if [ -n "$CHILD" ]; then
    UB_CHANNEL_JWT_SECRET=$(ps eww -p "$CHILD" | tr ' ' '\n' | grep '^UB_CHANNEL_JWT_SECRET=' | cut -d= -f2-) \
      "$NODE" /tmp/ub-question-session.mjs || echo "question session seed FAILED"
  fi
}
want_ownerquestion() { case " $ONLY " in *" $1 "*) true;; *) false;; esac; }
if [ -z "$ONLY" ] || want_ownerquestion testOwnerQuestion; then
  seed_question
fi
run testOwnerQuestion
if [ -z "$ONLY" ] || want_ownerquestion testOwnerQuestionDark; then
  seed_question
fi
run testOwnerQuestionDark
# The stamp repoints bot-test's session; restore the fixture session so any
# later chat/send legs (and reruns) open the seeded transcript again.
"$NODE" "$CTL" restore-session bot-test 2>/dev/null || true

# Live send last: a failed or quota-capped provider shouldn't block the rest.
# No LLM provider is configured on this VM's stack, so the leg runs against
# fixture eve (UB_S2_FIXTURE=1, no question variant): the send still goes
# phone → web → eve → streamed reply, and the reply is the planted token.
stop_eve
start_eve UB_S2_FIXTURE=1
run testLiveSend

echo "--- done"
if [ -n "$FAILED" ]; then
  echo "FAILED:$FAILED" >&2
  exit 1
fi
