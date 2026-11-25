#!/usr/bin/env bash
# Vídeo completo de un torneo: intro + combates + ganador + audio.
# Uso: ./run.sh spec.json salida_sin_extension [MB_maximos_whatsapp=15.5]
# Genera salida.master.mp4 (calidad alta) y salida.whatsapp.mp4 (<= MB indicados).
set -euo pipefail
SPEC=$(realpath "$1"); OUT=$(realpath -m "$2"); MAXMB=${3:-15.5}; D=$(cd "$(dirname "$0")" && pwd)
node "$D/make.cjs" "$SPEC" "$OUT.silent.mp4"
INTRO=$(node -e "const s=require('$SPEC');console.log(s.introSeconds||4)"); OUTRO=$(node -e "const s=require('$SPEC');console.log(s.outroSeconds||5)")
python3 "$D/audio.py" "$OUT.silent.mp4.events.json" "$OUT.wav" "$INTRO" "$OUTRO"
ffmpeg -y -loglevel error -i "$OUT.silent.mp4" -i "$OUT.wav" -c:v copy -c:a aac -b:a 160k -shortest -movflags +faststart "$OUT.master.mp4"
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT.master.mp4")
for TARGET in 14.8 13.5 12; do
  KBPS=$(python3 -c "print(int(($TARGET*8192)/$DUR-96))")
  ffmpeg -y -loglevel error -i "$OUT.master.mp4" -c:v libx264 -b:v ${KBPS}k -maxrate $((KBPS*3/2))k -bufsize $((KBPS*3))k -preset medium -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart "$OUT.whatsapp.mp4"
  SIZE=$(python3 -c "import os;print(os.path.getsize('$OUT.whatsapp.mp4')/1048576)")
  python3 -c "import sys;sys.exit(0 if $SIZE<=$MAXMB else 1)" && break
done
echo "master: $OUT.master.mp4 | whatsapp: $OUT.whatsapp.mp4 (${SIZE} MB, ${DUR}s)"
