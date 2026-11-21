# CertiFlow Setup Guide

## Requirements

- Docker Engine/Desktop with Docker Compose v2 for the recommended setup.
- Node.js 20+ and npm 10+ for running the frontend, backend, and integration tests on the host.

## Fresh clone: Docker Compose

From the repository root in PowerShell:

```powershell
Copy-Item .env.example .env
docker compose up --build -d
docker compose ps
docker compose logs -f backend
```

The backend waits for PostgreSQL and Redis, applies all committed Prisma migrations, seeds demo data if no users exist, and then starts the API. Subsequent container starts do not wipe application data. The seed command skips an already-populated database unless explicitly forced.

Open:

- Web app: http://localhost:5173
- API health: http://localhost:5000/api/health
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

To stop containers without deleting data:

```powershell
docker compose down
```

**Destructive reset:** `docker compose down -v` deletes the PostgreSQL, Redis, and certificate volumes. Use only when intentionally resetting the local demo.

### Compose environment

`.env.example` contains local demo values. Copy it to `.env` before Compose startup. The database URL inside Compose must use the service hostname `postgres`, not `localhost`. Change default database credentials and `JWT_SECRET` before any shared deployment. `VITE_API_URL` is embedded into the frontend at image build time.
If a host port is occupied, set `POSTGRES_HOST_PORT`, `REDIS_HOST_PORT`, `BACKEND_HOST_PORT`, or `FRONTEND_HOST_PORT` in `.env`; the service-to-service container ports do not change.

`BATCH_OVERDUE_HOURS` sets the overdue review threshold (default `48`). `SEED_DEMO_DATA=false` disables startup seeding. Provider failure and timeout probabilities are controlled by `WHATSAPP_SIMULATED_FAILURE_RATE` and `WHATSAPP_SIMULATED_TIMEOUT_RATE`.

## Host development

1. Start PostgreSQL and Redis:

   ```powershell
   docker compose up -d postgres redis
   ```

2. Create the backend environment file and install its dependencies:

   ```powershell
   Copy-Item backend\.env.example backend\.env
   Set-Location backend
   npm ci
   npx prisma generate
   npx prisma migrate deploy
   npm run prisma:seed
   npm run dev
   ```

3. In a second terminal from the repository root:

   ```powershell
   Set-Location frontend
   npm ci
   npm run dev
   ```

4. Visit http://localhost:5173. The backend `.env.example` uses host-accessible service URLs (`localhost`); do not use that database URL inside the backend container.

## Database migrations

Committed migrations are in `backend/prisma/migrations/`.

- **Fresh or deployed database:** `npx prisma migrate deploy` from `backend/`, or `docker compose exec backend npx prisma migrate deploy`.
- **Check migration state:** `npx prisma migrate status` from `backend/`.
- **Create a migration during development:** edit `schema.prisma`, then run `npx prisma migrate dev --name descriptive_change` from `backend/`. Commit the generated migration folder and updated schema.
- **Regenerate the client after schema changes:** `npx prisma generate`.

Prefer migrations over `prisma db push` for reproducible setups and deployments. `npm run db:reset` in the backend is destructive and should only be used with disposable databases.

## Demo data

The first Compose startup automatically applies migrations and seeds demo users, districts, training centres, workflow batches, certificates, and audit records. To seed manually:

```powershell
docker compose exec backend npx prisma db seed
```

For host development, run `npm run prisma:seed` from `backend/`. The seed script skips if users already exist. To deliberately delete and recreate all seeded application records:

```powershell
docker compose exec -e SEED_FORCE=true backend npx prisma db seed
```

The forced seed is destructive. All demo users use `password123`; the browser role switcher does not request a password. API calls in this demo identify a seeded user using the `x-user-id` header with either their email or database ID. Neither mechanism is production authentication.

## Automated tests

Start the local PostgreSQL and Redis services, install backend dependencies, apply migrations, and seed the database before running integration tests. Run tests against a disposable development database; test scripts create and remove records.
Run the complete backend integration suite with:

```powershell
npm --prefix backend run test:all
```

If you started the full Compose stack, stop the backend before running tests because it runs a delivery worker against the same Redis queue, then restart it after the suite:

```powershell
docker compose stop backend
npm --prefix backend run test:all
docker compose start backend
```

Individual suites:

```powershell
npm --prefix backend run test:upload-validation
npm --prefix backend run test:approval-workflow
npm --prefix backend run test:certificate-issuance
npm --prefix backend run test:certificate-delivery
npm --prefix backend run test:milestone9
npm --prefix backend run test:critical-scenarios
```

The delivery suite requires Redis. The tests cover rejected spreadsheet rollback, approval concurrency and roles, certificate idempotency and uniqueness, delivery retries, public cancellation, audit records, SLA detection, and returned-batch resubmission. Run the frontend production type-check/build with `npm --prefix frontend run build`.

## Troubleshooting

- **Backend unhealthy:** inspect `docker compose logs backend`; migration or seed failures prevent the API from starting.
- **Port conflicts:** stop the process using ports 5173, 5000, 5432, or 6379, or change the corresponding Compose port mappings.
- **Schema differs from migrations:** use a disposable database for testing; do not silently replace migration-managed state with `db push`.
- **Certificate PDF missing:** ensure the `certificates_data` volume is mounted and writable; retry issuance from the State Office API after fixing storage.
- **Delivery tests fail to connect:** check `docker compose ps` for a healthy Redis service.
