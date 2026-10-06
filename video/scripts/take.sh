#!/bin/zsh
# One filmed take of M1 to M3: reset the demo profile, cold-launch Useful Bot
# Dev while recording its window at 2x and 60 fps, run the scripted demo in
# take mode (real typing, sparse polling), stop the recorder, build the MP4.
# Usage: take.sh <n>
set -uo pipefail
n=$1
here=${0:A:h}
foot=~/UB001-footage
log=$foot/take-$n.log
"$here/reset-demo.sh" take-$n-$(date +%Y-%m-%d) > "$log" 2>&1 || { echo "reset failed"; exit 1; }
"$here/coldtake.sh" "$foot/take-$n" 1500 >> "$log" 2>&1 &
rec=$!
sleep 14
cd ~/Desktop/useful-bot
TAKE=1 SHOTS=$PWD/ub001-rehearsals python3 -u "$here/rehearse.py" take$n >> "$log" 2>&1
rc=$?
sleep 4
pkill -f "winrec2x .* $foot/take-$n " || kill $rec
sleep 2
python3 "$here/frames2mp4.py" "$foot/take-$n" "$foot/take-$n.mp4" >> "$log" 2>&1
echo "take $n exit $rc"
grep -A8 '"asked_first"' "$log" | grep -v '_out'
grep ABORT "$log"
