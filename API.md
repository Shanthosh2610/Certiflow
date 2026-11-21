# CertiFlow API Reference

Base URL in the local demo: `http://localhost:5000/api`.

## Authentication and authorization

Protected demo requests use `x-user-id` with a seeded user's email or PostgreSQL ID:

```http
x-user-id: farah@state.certiflow.gov.in
```

This is a demo identity selector, not secure authentication. There is no signed JWT/session validation. Role checks are enforced by the API for workflow operations. Do not expose this authentication design to the public internet.

## Health

### `GET /health`

Returns API, PostgreSQL, Redis, and BullMQ status. A degraded response currently uses HTTP 200; inspect the JSON `status` and component states.

## Batches

### `GET /batches`

Returns all batches with district, centre, approval, and candidate-count information. Currently public in this prototype; protect it in a real deployment.

### `GET /batches/:id`

Returns the batch, candidate roster, and approvals. `:id` may be a database ID or batch number. Currently public in this prototype.

### `POST /batches`

Creates a draft batch for the authenticated Training Centre user, using the centre/district associated with that account.

```json
{ "courseName": "Solar PV Technician" }
```

### `GET /batches/template/download`

Downloads the CSV roster template.

### `POST /batches/validate-upload`

Validates a multipart spreadsheet without writing candidates. Form fields:

- `file`: `.csv`, `.xls`, or `.xlsx`
- `batchId` (optional): also checks candidate IDs already in the batch

Validation errors are included in `validation.errors` and `validation.preview`; validation failures may still return HTTP 200 with `validation.isValid: false`.

### `POST /batches/commit-upload`

Training Centre only. Atomically revalidates and saves the full candidate roster. Body:

```json
{
  "batchId": "batch-uuid",
  "candidates": [
    {
      "fullName": "Aarav Sharma",
      "phone": "+919876543210",
      "email": "aarav@example.test",
      "nationalId": "AADHAAR-HASH-1001",
      "grade": "A",
      "completionDate": "2026-11-20"
    }
  ]
}
```

An invalid roster returns HTTP 422 and does not partially update the batch. Uploading corrections to a returned batch moves it to district review and starts a new review round.

### `POST /batches/:id/submit`

Training Centre only. Submits a nonempty draft batch for district review.

### `POST /batches/:id/resubmit`

Training Centre only. Resubmits a returned batch after corrections. Increments the review round while preserving prior approvals as history.

### `POST /batches/:id/review`

Role depends on the current stage: District Officer, Quality Team, or State Office. Body:

```json
{
  "action": "APPROVED",
  "remarks": "Reviewed and verified",
  "expectedVersion": 3
}
```

`action` is `APPROVED`, `REJECTED`, or `RETURNED`; non-approval actions require remarks. A stale `expectedVersion` returns HTTP 409.

### `GET /batches/overdue`

State Office only. Lists batches in review whose last update exceeds `BATCH_OVERDUE_HOURS` (default 48). Response includes the configured threshold and each batch's waiting duration.

## Certificates

### `GET /certificates/verify/:certificateNumber`

Public verification. A valid certificate returns HTTP 200 with `status: "VALID"`; a cancelled certificate returns HTTP 200 with `status: "CANCELLED"`. A missing number returns HTTP 404 with `status: "INVALID"`. The public response omits internal identifiers, national ID, grade, verification hash, and cancellation reason.

Compatible public lookup paths also exist at `GET /certificates/:certificateNumber` and `GET /public/verify/:certificateNumber`.

### `GET /certificates/:certificateNumber/download`

Downloads the certificate PDF. This prototype route is public; production should use authorized or short-lived signed file access.

### `GET /certificates`

Lists certificate registry details. Currently public and includes personal/internal fields; restrict this endpoint before any production deployment.

### `POST /certificates/batches/:batchId/issue`

State Office only. Idempotently issues or repairs PDFs for a completed batch and enqueues delivery. Returns the certificate number, PDF URL, and status for each eligible candidate.

### `POST /certificates/:certificateNumber/delivery/retry`

State Office only. Manually retries a delivery after automatic attempts fail. Returns HTTP 202 when queued.

### `POST /certificates/:certificateNumber/revoke`

State Office only. Cancels a certificate and updates the public verification result.

```json
{ "reason": "Audit review found an invalid completion record." }
```

## Audit history

### `GET /audit-logs?limit=500`

State Office only. Returns up to 1,000 most recent persisted audit events, including timestamp, action, actor (when available), entity type/ID, and structured details/state changes.

## Common errors

Errors use a JSON envelope such as:

```json
{
  "success": false,
  "error": { "message": "A human-readable explanation" }
}
```

Usual status codes are 400 for invalid workflow input, 401 for missing/invalid demo identity, 403 for role denial, 404 for missing resources, 409 for stale concurrent updates, and 422 for rejected roster commits.
