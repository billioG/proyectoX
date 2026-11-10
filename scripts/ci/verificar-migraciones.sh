#!/usr/bin/env bash
# Comprueba en un PostgreSQL DESECHABLE que supabase/schema.sql + las migraciones de scripts/ci/migraciones-orden.txt aplican sin errores
# y que migrations/verificar-migraciones.sql da "aplicada = true" en todas las filas.
#
#   PGHOST=... PGUSER=... PGPASSWORD=... PGDATABASE=... bash scripts/ci/verificar-migraciones.sh
#
# Qué es y qué NO es:
#   * Es una comprobación de que el SQL del repositorio es coherente y aplica en orden. Así PENDIENTES.md deja de ser la única referencia.
#   * NO es producción ni Supabase: usa roles y esquemas de mentira (scripts/ci/supabase-stub.sql) y el volcado del 29/09/2026
#     (supabase/schema.sql), que puede estar atrasado respecto de la base real. No sustituye correr verificar-migraciones.sql en Supabase.
#   * Borra y recrea el esquema "public" de la base a la que se conecta: usar SOLO una base desechable.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)

# Protección: nunca contra una base que parezca real.
case "${PGHOST:-localhost}" in
  localhost|127.0.0.1|::1|postgres|db) ;;
  *) echo "Rechazado: PGHOST=${PGHOST} no parece una base desechable (localhost, 127.0.0.1, postgres o db)."; exit 2 ;;
esac
if [[ "${PGHOST:-}" == *supabase* ]]; then echo "Rechazado: es Supabase."; exit 2; fi

say() { printf '\n==> %s\n' "$1"; }
version_num="$("${PSQL[@]}" -tA -c 'show server_version_num')"

say "Roles y esquemas mínimos de Supabase"
"${PSQL[@]}" -c 'drop schema if exists public cascade' >/dev/null 2>&1 || true
"${PSQL[@]}" -f "$ROOT/scripts/ci/supabase-stub.sql" >/dev/null 2>"$TMP/stub.err" || { cat "$TMP/stub.err"; exit 1; }
"${PSQL[@]}" -c 'drop schema if exists public cascade'

say "Esquema (supabase/schema.sql, volcado del 29/09/2026)"
# \restrict/\unrestrict son de pg_dump 17.6+; transaction_timeout y el privilegio MAINTAIN no existen antes de PostgreSQL 17.
grep -vE '^([\\](un)?restrict |SET transaction_timeout)' "$ROOT/supabase/schema.sql" > "$TMP/schema.sql"
if [ "$version_num" -lt 170000 ]; then sed -i 's/,MAINTAIN//g' "$TMP/schema.sql"; fi
"${PSQL[@]}" -f "$TMP/schema.sql" >/dev/null

say "Migraciones, en el orden de scripts/ci/migraciones-orden.txt"
applied=0
while IFS= read -r name; do
  [[ -z "$name" || "$name" == \#* ]] && continue
  file="$ROOT/migrations/$name.sql"
  [ -f "$file" ] || { echo "::error::No existe migrations/$name.sql"; exit 1; }
  if ! "${PSQL[@]}" -f "$file" >/dev/null 2>"$TMP/mig.err"; then
    echo "::error file=migrations/$name.sql::La migración falló"; cat "$TMP/mig.err"; exit 1
  fi
  applied=$((applied + 1)); echo "  ok  $name"
done < "$ROOT/scripts/ci/migraciones-orden.txt"
echo "$applied migraciones aplicadas sin errores"

say "Segunda pasada (las migraciones deben poder repetirse)"
while IFS= read -r name; do
  [[ -z "$name" || "$name" == \#* ]] && continue
  if ! "${PSQL[@]}" -f "$ROOT/migrations/$name.sql" >/dev/null 2>"$TMP/mig.err"; then
    echo "::error file=migrations/$name.sql::No se puede volver a ejecutar"; cat "$TMP/mig.err"; exit 1
  fi
done < "$ROOT/scripts/ci/migraciones-orden.txt"
echo "ok: todas se repiten sin error"

say "migrations/verificar-migraciones.sql"
psql -X -tA -F '|' -f "$ROOT/migrations/verificar-migraciones.sql" > "$TMP/verif.txt"
total="$(wc -l < "$TMP/verif.txt" | tr -d ' ')"
falsas="$(grep -E '\|f$' "$TMP/verif.txt" || true)"
echo "$total comprobaciones"
if [ -n "$falsas" ]; then
  echo "::error::Estas comprobaciones dieron false tras aplicar todo:"; echo "$falsas"; exit 1
fi
echo "ok: todas las comprobaciones dan true"
