# RA-4956 RLS harness — one-command runner that provisions and tears down a
# disposable Postgres via Docker, then asserts tenant isolation.
#
#   make -f scripts/rls-harness/Makefile rls-test
#
# Requires Docker. If you already have a local Supabase stack running, prefer:
#   DATABASE_URL=... scripts/rls-harness/run.sh   (see scripts/rls-harness/run.sh header)

PG_CONTAINER := ra-rls-pg
PG_PORT      := 55432
PG_PW        := ra_rls_pw
DATABASE_URL := postgres://postgres:$(PG_PW)@localhost:$(PG_PORT)/postgres
HERE         := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))

.PHONY: rls-test rls-up rls-down

rls-test: rls-up
	@echo "Waiting for Postgres to accept TCP connections…"
	@# Probe over TCP, not the unix socket. On first boot the postgres image runs a
	@# temporary init server that answers on the socket only (listen_addresses=''),
	@# then restarts; a socket probe reported ready before that restart and the
	@# harness's first psql was dropped with "server closed the connection
	@# unexpectedly". Never-ready is a failure, not a silent fall-through.
	@ready=0; for i in $$(seq 1 60); do \
	  if docker exec $(PG_CONTAINER) pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then ready=1; break; fi; \
	  sleep 1; \
	done; \
	if [ $$ready -ne 1 ]; then \
	  echo "Postgres did not accept TCP connections within 60s"; \
	  docker logs $(PG_CONTAINER) 2>&1 | tail -20; \
	  $(MAKE) -f "$(HERE)Makefile" rls-down; \
	  exit 1; \
	fi
	@DATABASE_URL="$(DATABASE_URL)" bash "$(HERE)run.sh"; \
	  status=$$?; \
	  $(MAKE) -f "$(HERE)Makefile" rls-down; \
	  exit $$status

rls-up:
	@docker rm -f $(PG_CONTAINER) >/dev/null 2>&1 || true
	@docker run -d --rm --name $(PG_CONTAINER) \
	  -e POSTGRES_PASSWORD=$(PG_PW) -p $(PG_PORT):5432 postgres:16 >/dev/null
	@echo "Started disposable postgres:16 container '$(PG_CONTAINER)' on :$(PG_PORT)"

rls-down:
	@docker rm -f $(PG_CONTAINER) >/dev/null 2>&1 || true
	@echo "Removed container '$(PG_CONTAINER)'"
