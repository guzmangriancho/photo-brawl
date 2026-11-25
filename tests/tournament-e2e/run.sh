#!/usr/bin/env bash
# Requiere Postgres con la migración V66 aplicada, PostgREST en :3000, y /tmp/pgt/{service.jwt,key.pem,cert.pem}. Ver README en este directorio.
set -e
cd "$(dirname "$0")/../.."
(/tmp/pgt/postgrest /tmp/pgt/pgrst.conf >/tmp/pgt/pgrst.log 2>&1 &)
sleep 2
node tests/tournament-e2e/e2e.cjs
pkill -f /tmp/pgt/postgrest || true
