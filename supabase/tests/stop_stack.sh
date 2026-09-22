#!/usr/bin/env bash
# Removes the containers and network made by start_stack.sh.
docker rm -f sarmaya-postgrest sarmaya-gotrue sarmaya-db >/dev/null 2>&1 || true
docker network rm sarmaya-test >/dev/null 2>&1 || true
