#!/bin/zsh
# Tile frames of a take for picking cuts: sheet.sh <mp4> <start> <end> <step> <out.jpg> [crop w:h:x:y] [cols]
set -euo pipefail
src=$1; a=$2; b=$3; step=$4; out=$5; crop=${6:-}; cols=${7:-4}
tmp=$(mktemp -d)
i=0
for t in $(seq $a $step $b); do
  i=$((i+1))
  vf="scale=480:-2"; [ -n "$crop" ] && vf="crop=$crop,scale=480:-2"
  ffmpeg -v error -y -ss $t -i "$src" -frames:v 1 -vf "$vf" $tmp/$(printf "k%03d.jpg" $i)
done
rows=$(( (i + cols - 1) / cols ))
ffmpeg -v error -y -pattern_type glob -i "$tmp/k*.jpg" -vf "tile=${cols}x${rows}:padding=4" -frames:v 1 "$out"
rm -rf $tmp
echo "$out: $i frames, $a..$b step $step, ${cols} per row"
