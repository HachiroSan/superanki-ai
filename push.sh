#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

SRC="${SRC:-$HOME/sync/}"
DST="${DST:-sn-digest@192.168.1.151:/srv/rsync/supernote/}"
LOG="${LOG:-$HOME/supernote_rsync.log}"

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

echo "$(ts) start rsync from $SRC to $DST" | tee -a "$LOG"

# Quick connectivity check
HOST=$(echo "$DST" | cut -d: -f1)
if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "$HOST" : 2>/dev/null; then
  echo "$(ts) ssh not reachable, abort" | tee -a "$LOG"
  exit 1
fi

# Dry run summary
rsync -avz --dry-run --include="*.txt" --exclude="*" "$SRC" "$DST" | tee -a "$LOG"

# Real transfer
rsync -avz --progress --partial \
  --include="*.txt" --exclude="*" \
  --remove-source-files \
  "$SRC" "$DST" | tee -a "$LOG"

echo "$(ts) rsync complete" | tee -a "$LOG"