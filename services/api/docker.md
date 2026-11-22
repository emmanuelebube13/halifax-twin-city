# Running the serving API in Docker

**Status: unverified.** Docker and WSL are not installed on the build machine (they need administrator rights), so these files have never been built or run. Treat them as a starting point. The supported way to run the API today is the Python virtual environment described in `README.md`.

## Files

| File | Purpose |
| :---- | :---- |
| `Dockerfile` | Python 3.12 slim image with the API and `config/`, running as a non-root user on port 8010 |
| `compose.yaml` | One service, port published on 127.0.0.1 only, settings from the environment |

Neither file holds a password or token.

## Reaching the database on the host

PostgreSQL runs on the host at `localhost:5433`. Inside a container `localhost` is the container itself, so the compose file points at `host.docker.internal:5433` (Docker Desktop provides that name; `extra_hosts: host-gateway` adds it on Linux engines). Two host changes would be needed, both by the architect:

1. PostgreSQL must listen on an address the container can reach (`listen_addresses` in `postgresql.conf`), and `pg_hba.conf` must allow the Docker network with `scram-sha-256`. Keep it closed to everything else.
2. The password: the container cannot read the host's `pgpass.conf`. Either mount a pgpass file read-only and set `PGPASSFILE`, or set `HALIFAX_TWIN_DOCKER_DB_URL` in your own shell for the session. Never write it into `compose.yaml` or any file in the repository.

## Commands (once Docker is installed)

```powershell
cd services\api
docker compose up --build        # start
docker compose down              # stop
curl http://127.0.0.1:8010/v1/health
```

## The Cesium token

`CESIUM_ION_TOKEN` is passed through from your shell if set. Note that the API sends the token only to callers on this computer; from inside a container, requests forwarded by Docker may appear to come from the Docker gateway address rather than 127.0.0.1, in which case 3D is reported as unavailable. Check `/v1/client-config` after the first start.
