#!/usr/bin/env bash
source /workspace/kit/pod/env.sh
S=/workspace/kit/state
STALL_MIN=${STALL_MIN:-120}; ARCHIVE_MIN=${ARCHIVE_MIN:-60}
exec 9> $S/watchdog.lock
flock -n 9 || { echo "watchdog already running"; exit 0; }
log() { echo "$(date -u +%FT%TZ) $*"; }
mtime() { stat -c %Y "$1" 2>/dev/null || echo 0; }
date +%s > $S/last_activity
archive_all() { [ "$WS_NETWORK" = 1 ] || return 0; for w in $WS_ROOT/*-ws; do [ -d "$w" ] && timeout 3600 bash /workspace/kit/pod/archive_ws.sh "$(basename "$w" -ws)"; done; date +%s > $S/last_archive; }
stop_pod() {
  log "stopping pod: $1"
  echo "$(date -u +%FT%TZ) $1" > $S/autostop_reason
  if [ -f $S/no_autostop ]; then log "no_autostop set; not stopping"; return; fi
  archive_all
  if runpodctl pod stop "$RUNPOD_POD_ID" 2>&1 || runpodctl stop pod "$RUNPOD_POD_ID" 2>&1; then rm -f $S/stop_failed; else
    log "STOP FAILED: runpodctl could not stop this pod; it keeps billing. Stop it with: lme stop <name>"
    date -u +%FT%TZ > $S/stop_failed
  fi
  sleep 600
}
gen_now() { tail -n 1 /workspace/telemetry/telemetry.jsonl 2>/dev/null | python3 -c "import json,sys;print(int(json.load(sys.stdin)['vllm'].get('vllm:generation_tokens_total',0)))" 2>/dev/null || echo 0; }
last_gen=-1; gen_changed=$(date +%s)
log "watchdog up pod=${RUNPOD_POD_ID:-?} grace=${GRACE_MIN}m hold=${HOLD_AFTER_PULL_MIN}m idle_max=${IDLE_MAX_MIN}m stall=${STALL_MIN}m ws_network=$WS_NETWORK"
while true; do
  now=$(date +%s)
  active=0; active_signet=0; signet_runs=""; pending=0; last_exit=0; stale_log=1
  for m in /workspace/runs/*.meta; do
    [ -e "$m" ] || continue
    r=$(basename "$m" .meta)
    if [ -f /workspace/runs/$r.active ]; then
      if pgrep -f "runs/$r.cmd.sh" >/dev/null; then
        active=$((active + 1))
        grep -q signet-dreaming "$m" && { active_signet=$((active_signet + 1)); signet_runs="$signet_runs $r"; }
        [ $((now - $(mtime /workspace/runs/$r.log))) -lt $((STALL_MIN * 60)) ] && stale_log=0
        continue
      fi
      lost_at=$(tail -n 1 /workspace/telemetry/telemetry.jsonl 2>/dev/null | python3 -c "import json,sys;print(int(json.load(sys.stdin)['t']))" 2>/dev/null || echo $now)
      log "run $r marked active but its process is gone (pod restart?); marking lost at $lost_at"
      echo lost > /workspace/runs/$r.exit; touch -d "@$lost_at" /workspace/runs/$r.exit; rm -f /workspace/runs/$r.active
      echo "{\"event\":\"exit\",\"t\":$lost_at,\"rc\":\"lost\"}" >> "$m"
    fi
    [ -f /workspace/runs/$r.exit ] || continue
    t=$(mtime /workspace/runs/$r.exit); [ $t -gt $last_exit ] && last_exit=$t
    if [ ! -f /workspace/runs/$r.collected ]; then
      log "run $r exited ($(cat /workspace/runs/$r.exit)); collecting"
      timeout 1800 bash /workspace/kit/pod/collect.sh "$r" > /workspace/logs/collect_$r.log 2>&1 && log "collected $r" || log "collect $r failed (see logs/collect_$r.log)"
    fi
    [ -f /workspace/runs/$r.pulled ] || pending=$((pending + 1))
  done
  g=$(gen_now); if [ "$g" != "$last_gen" ]; then last_gen=$g; gen_changed=$now; fi

  if [ $active -gt 0 ]; then
    if [ -f $S/deadline ] && [ $now -ge $(cat $S/deadline) ]; then
      log "deadline reached; stopping runs (resumable)"
      rm -f $S/deadline
      bash /workspace/kit/pod/stop_run.sh
      for p in $(pgrep -f "[r]uns/.*\.cmd\.sh|[s]rc/index.ts ingest -p supermemory|[s]rc/index.ts run -r|[s]upermemory-server"); do kill $p 2>/dev/null; done
      for a in /workspace/runs/*.active; do [ -e "$a" ] && { echo deadline > "${a%.active}.exit"; rm -f "$a"; }; done
      date +%s > $S/last_activity
      continue
    fi
    if [ $active_signet -gt 0 ] && [ $stale_log = 1 ] && [ $((now - gen_changed)) -ge $((STALL_MIN * 60)) ]; then
      log "STALL: no generation and no run-log growth for ${STALL_MIN}m; stopping Signet runs (resumable with --resume)"
      bash /workspace/kit/pod/stop_run.sh
      for r in $signet_runs; do echo stalled > /workspace/runs/$r.exit; rm -f /workspace/runs/$r.active; done
      date +%s > $S/last_activity
      continue
    fi
    [ $((now - $(cat $S/last_archive 2>/dev/null || echo 0))) -ge $((ARCHIVE_MIN * 60)) ] && archive_all > /workspace/logs/archive.log 2>&1
  else
    ref=$(cat $S/last_activity 2>/dev/null || echo $now); [ $last_exit -gt $ref ] && ref=$last_exit
    idle=$(( (now - ref) / 60 ))
    if [ $pending -gt 0 ]; then limit=$GRACE_MIN; why="runs finished; $pending not pulled (evidence is in /workspace/evidence)"
    elif [ $last_exit -gt 0 ]; then limit=${HOLD_AFTER_PULL_MIN:-10}; why="all runs finished and pulled"
    else limit=$IDLE_MAX_MIN; why="no run started"; fi
    [ $idle -ge $limit ] && stop_pod "$why; idle ${idle}m (limit ${limit}m)"
  fi
  echo "{\"t\":$now,\"active\":$active,\"unpulled\":$pending,\"last_exit\":$last_exit,\"stop_failed\":$([ -f $S/stop_failed ] && echo true || echo false)}" > $S/watchdog.json
  sleep 60
done
