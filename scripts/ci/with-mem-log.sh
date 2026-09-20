#!/usr/bin/env bash
# Runs a command while printing the runner's memory every 10 seconds.
#
# The sampler writes into the step's own log, not to a file, on purpose: when a
# GitHub runner runs out of memory it is shut down mid-step ("The runner has
# received a shutdown signal"), later steps never run, and an artifact upload
# never happens. The step log is the only record that survives.
set -u

(
  while :; do
    free -m | awk 'NR==2 { printf "[mem] used=%sMB available=%sMB\n", $3, $7 }'
    # Detached from the step's output so a sleep outliving the loop cannot hold it open.
    sleep 10 </dev/null >/dev/null 2>&1
  done
) &
sampler=$!

"$@"
status=$?

kill "$sampler" 2>/dev/null
exit "$status"
