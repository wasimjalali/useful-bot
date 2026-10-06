#!/bin/zsh
# A short take: record the Useful Bot Dev window at 2x/60 fps while one batch
# of background actions runs. Usage: short.sh <name> <seconds> '<setup json>' '<action json>'
set -uo pipefail
here=${0:A:h}
name=$1; secs=$2; setup=$3; action=$4
read pid wid < /tmp/ubw
cd ~/Desktop/useful-bot
$HOME/.local/bin/cua-driver call bring_to_front "{\"pid\":$pid,\"window_id\":$wid}" >/dev/null 2>&1
python3 "$here/drive.py" $pid $wid "$setup" | tail -3
"$here/../winrec2x" $wid $secs ~/UB001-footage/$name 60 > /dev/null 2>&1 &
rec=$!
sleep 1.5
python3 "$here/drive.py" $pid $wid "$action" | tail -4
wait $rec
python3 "$here/frames2mp4.py" ~/UB001-footage/$name ~/UB001-footage/$name.mp4 | tail -1
