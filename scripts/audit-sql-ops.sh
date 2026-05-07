#!/usr/bin/env bash
# Audits scripts/prod-drift-fix.sql by counting operation types.
# Read-only — does not connect to any DB.

SQL=scripts/prod-drift-fix.sql

if [ ! -f "$SQL" ]; then
  echo "ERROR: $SQL not found. Run scripts/generate-prod-drift-fix.ts first."
  exit 1
fi

echo "=== File ==="
ls -la "$SQL"
echo ""
echo "=== Operation counts ==="
printf "  %-22s %s\n" "CREATE TABLE:"        "$(grep -c '^CREATE TABLE ' $SQL)"
printf "  %-22s %s\n" "CREATE INDEX:"        "$(grep -c '^CREATE.*INDEX ' $SQL)"
printf "  %-22s %s\n" "CREATE TYPE (enum):"  "$(grep -c '^CREATE TYPE ' $SQL)"
printf "  %-22s %s\n" "ALTER TABLE ADD:"     "$(grep -c '^ALTER TABLE.*ADD ' $SQL)"
printf "  %-22s %s\n" "ALTER TABLE DROP:"    "$(grep -c '^ALTER TABLE.*DROP ' $SQL)"
printf "  %-22s %s\n" "ALTER TABLE ALTER:"   "$(grep -c '^ALTER TABLE.*ALTER COLUMN' $SQL)"
printf "  %-22s %s\n" "ALTER TABLE RENAME:"  "$(grep -c '^ALTER TABLE.*RENAME ' $SQL)"
printf "  %-22s %s\n" "DROP TABLE:"          "$(grep -c '^DROP TABLE' $SQL)"
printf "  %-22s %s\n" "DROP INDEX:"          "$(grep -c '^DROP INDEX' $SQL)"
printf "  %-22s %s\n" "DROP TYPE:"           "$(grep -c '^DROP TYPE' $SQL)"
printf "  %-22s %s\n" "DROP CONSTRAINT:"     "$(grep -c 'DROP CONSTRAINT' $SQL)"
printf "  %-22s %s\n" "ADD FOREIGN KEY:"     "$(grep -c 'ADD CONSTRAINT.*FOREIGN KEY' $SQL)"
printf "  %-22s %s\n" "ADD PRIMARY KEY:"     "$(grep -c 'ADD CONSTRAINT.*PRIMARY KEY' $SQL)"
printf "  %-22s %s\n" "RENAME INDEX:"        "$(grep -c '^ALTER INDEX.*RENAME' $SQL)"
echo ""
echo "=== Destructive ops scan (DROP TABLE / DROP COLUMN / DROP CONSTRAINT) ==="
grep -nE '^DROP TABLE|^ALTER TABLE.*DROP COLUMN|^ALTER TABLE.*DROP CONSTRAINT' $SQL | head -50 || echo "  (no destructive table-level operations found)"
