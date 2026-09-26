#!/bin/sh
set -e
node src/migrate.js
if [ "${ROLE:-api}" = "worker" ]; then exec node src/worker.js; else exec node src/server.js; fi
