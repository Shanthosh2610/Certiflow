> **Requirements:** Docker Engine/Desktop with Docker Compose v2 for the one-command demo. For host development, install Node.js 20+ and npm 10+.

## Architecture

CertiFlow is a React SPA backed by a TypeScript/Express API, PostgreSQL, Redis/BullMQ workers, and persistent PDF storage. See the [architecture diagram](ARCHITECTURE.md) and [API reference](API.md).

## Technology decisions

- **React, Vite, TypeScript:** fast, typed single-page workflow for training centres, reviewers, and the State Office.
- **Express and TypeScript:** REST API with role checks at workflow boundaries.
- **PostgreSQL and Prisma:** relational approval, candidate, certificate, delivery, and audit records; migrations capture schema changes.
- **Redis and BullMQ:** async WhatsApp delivery with retry/backoff and idempotent jobs.
- **PDFKit and QRCode:** certificates with QR-linked public verification.
- **Docker Compose:** repeatable local demo including schema migration and initial demo data.

## Event flow

1. A training centre creates a draft batch and uploads a CSV/XLS/XLSX candidate roster.
2. The API validates the complete roster before an atomic database write.
3. District officers approve by quorum. Large batches pass through Quality before State Office review. A returned batch can be corrected and resubmitted in a new review round.
4. Final State approval creates one idempotent certificate per eligible candidate, stores metadata, generates PDFs, and queues delivery.
5. BullMQ workers simulate WhatsApp success, timeout, failure, and retry. Delivery status is stored separately from certificate status.
6. Anyone can verify a certificate ID or QR URL. State Office cancellation immediately changes public verification to cancelled.
7. Important user actions are persisted in the audit history; State Office can view overdue review batches using the configured SLA threshold.

## How to run

From a fresh clone, copy the Compose demo environment and start the stack:

```powershell
Copy-Item .env.example .env
docker compose up --build -d
docker compose ps
docker compose logs -f backend
```

Compose applies PostgreSQL migrations and seeds demo data the first time the database is empty. Open:

- Frontend: http://localhost:5173
- API health: http://localhost:5000/api/health
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

See [SETUP.md](SETUP.md) for host development, database migration, seeding, and test instructions. See [DEPLOYMENT.md](DEPLOYMENT.md) for scale assumptions and production considerations.

## Demo users

The local demo user selector switches roles without a password. For API examples, `x-user-id` accepts a seeded user's email or database ID. The seed password is `password123`; this is demo-only and is not a production authentication system.

| User | Role | Email |
|---|---|---|
| Anika Sharma | Training Centre | `anika@training.certiflow.gov.in` |
| Dev Verma | District Officer, Bhopal | `dev@district.certiflow.gov.in` |
| Meera Patel | District Officer, Bhopal | `meera@district.certiflow.gov.in` |
| Kabir Khan | District Officer, Indore | `kabir@district.certiflow.gov.in` |
| Neha Roy | Quality Team | `neha@quality.certiflow.gov.in` |
| Farah Siddiqui | State Office | `farah@state.certiflow.gov.in` |

## Features

- Spreadsheet validation, atomic candidate imports, and duplicate candidate checks.
- Multi-stage approval workflow, district quorum, optimistic concurrency checks, return/resubmission, and review-round history.
- Idempotent certificate issuance, downloadable PDF certificates, QR verification, and State Office cancellation.
- Simulated asynchronous WhatsApp delivery with retries, delivery status, and manual retry.
- Persisted audit history and configurable overdue-batch detection.
- Public certificate verification that distinguishes valid, cancelled, and invalid IDs.

## Known limitations

- WhatsApp delivery is simulated; no real WhatsApp account or provider credentials are configured.
- The demo identity mechanism accepts an email or user ID in a request header. It is not suitable for production authentication or authorization.
- Some registry/list and PDF download routes are public in this prototype. Production should protect administrative data and issue short-lived, authorized file links.
- PDF creation currently occurs in the issuance API process. The deployment plan recommends moving bulk PDF work to a dedicated worker queue before a 30,000-document peak.
- Docker Compose is a single-host demo, not a production high-availability deployment. Its default credentials, volumes, and simulated-provider probabilities are for local use only.
- No benchmark establishes the stated 100,000-user or peak-throughput targets; the sizing in [DEPLOYMENT.md](DEPLOYMENT.md) is a starting estimate, not a capacity guarantee.
