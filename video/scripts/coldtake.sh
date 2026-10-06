#!/bin/zsh
# Cold-start take: launch Useful Bot Dev in the background and start recording
# its main window the moment it exists. Usage: coldtake.sh <outdir> <seconds>
out=$1; secs=$2
here=${0:A:h}
open -g "$HOME/Applications/Useful Bot Dev.app"
for i in $(seq 1 400); do
  wid=$(cd ~ && cua-driver call list_windows '{}' 2>/dev/null | python3 -c "
import json,sys
d=json.load(sys.stdin); ws=d.get('windows',d) if isinstance(d,dict) else d
c=[w for w in ws if w.get('app_name')=='Useful Bot Dev' and w.get('title')=='Useful Bot Dev']
print(c[0]['window_id'] if c else '')")
  [ -n "$wid" ] && break
  sleep 0.05
done
echo "window $wid"
exec "$here/../winrec2x" "$wid" "$secs" "$out" 60
