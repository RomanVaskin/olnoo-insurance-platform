# Policies management

Implemented 2026-09-17. No database migration, new status, or issuance/refund workflow.

## Access

All routes require the session cookie. Management is allowed for super_admin; admin
with `manage` on the policy product's category; federation_secretary/director for
an assigned federation. Read-only admins may list/read/download within their category,
but every management action returns 403. Out-of-category admins, out-of-federation
staff, athletes and guardians receive 403 on these staff record routes. Collection
reads filter staff scope. Athlete self-service routes are unchanged.

Secretary responses have `payment: null` and `application.amount_kopecks: null`.
Directors retain those financial values. The secretary UI hides the payment card.

## Endpoint contracts

Base: `/api/policies`. All successful requests below return 200.

| Method/path | Request | Response |
| --- | --- | --- |
| GET `/` | No body | Array of policy summaries, filtered by scope |
| GET `/:id` | No body | Policy detail |
| PATCH `/:id` | Exactly `{ "policy_number": "..." }` | Updated policy detail |
| POST `/:id/cancel` | No body or `{}` | Updated policy detail |
| POST `/:id/reactivate` | No body or `{}` | Updated policy detail |
| POST `/:id/expire` | No body or `{}` | Updated policy detail |
| POST `/:id/generate-pdf` | No body or `{}` | `{ policy_id, insurer, policy_url }`; insurer is `reso` or `ingos` |
| GET `/:id/pdf` | No body | Authenticated PDF attachment, `application/pdf` |

Policy summary fields: `id`, `policy_number`, `status`, `valid_from`, `valid_to`,
`policy_url`, `person`, `federation`, `product` (existing summary shapes).
Detail adds `application` and `payment`. Application is null or
`{ id, status, amount_kopecks, created_at }`; amount is null for secretaries.
Payment uses the existing latest-payment summary and is null for secretaries.
`policy_url` is a private storage filename, not a public download URL.

Errors use `{ "error": "code" }`: 401 unauthorized, 403 forbidden,
404 policy_not_found. Invalid UUIDs return 400 invalid_uuid.
PATCH: 400 invalid_fields for extra fields/non-object bodies,
policy_number_required for missing/non-string/blank numbers,
invalid_policy_number for trimmed numbers over 200 characters or containing ASCII
control characters, policy_not_editable when the safety conditions below fail,
policy_number_taken for the database unique constraint. Numbers are trimmed;
uniqueness remains global and case-sensitive as in the existing schema.
POST actions reject supplied fields/non-object bodies with 400 invalid_fields.
Lifecycle failures return 400 invalid_transition. Unsupported PDF insurers return
400 unsupported_insurer. PDF download returns 404 policy_pdf_not_generated or
policy_pdf_file_not_found as appropriate. Unexpected failures remain 500.

## Lifecycle rules

- Number correction: status active, valid_to >= database current_date, no generated
  PDF, linked application draft/pending_payment, and no linked payment whose status
  is paid/refunded or whose paid_at is populated. All conditions are checked in the
  conditional UPDATE. Paid/issued policy numbers are therefore immutable here.
- Cancel: active -> cancelled. This records policy cancellation only; it neither
  cancels the application nor refunds/reverses a payment.
- Reactivate: cancelled -> active, valid_to >= current_date, application not cancelled,
  and no refunded payment. Future-start policies remain eligible.
- Expire: active -> expired only when valid_to < current_date. Coverage includes the
  final day. Expired is terminal; repeated actions/other transitions return 400.
- No direct status PATCH. Person, product, federation, application linkage, coverage
  dates, amount and PDF path cannot be supplied as editable fields.
- Lifecycle actions preserve policy number, coverage dates, insured person, product,
  application/payment records and links. They do not invent a refund/issuance state.
- PDF generation/regeneration reuses the existing templates and current platform
  data for any existing policy status. It does not issue/reactivate the policy or
  change payment/application state. A policy row lock serializes generation with
  corrections and lifecycle actions. All generation reads use the same DB client.
  Atomic private-file replacement prevents concurrent downloads seeing partial PDFs.
  Download filenames support Unicode safely using encoded Content-Disposition.

## Verification

QA uses Fastify injection with real session cookies, PostgreSQL constraints and the
real PDF generator (including Ghostscript), in a unique temporary schema created
from the checked-in migrations. No production records are modified. The schema,
accounts, sessions, records and generated files are removed in a finally block.

108 checks passed: management roles; every write denied for read-admin,
out-of-scope admin, out-of-federation staff, athlete and guardian; read/download scope;
number/status/immutable-field validation; unique constraint and concurrent duplicate
corrections; expiry boundary; paid/issued immutability; cancelled application/refund
reactivation denial; secretary finance redaction/director finance visibility;
PDF generation and regeneration for every allowed staff role; protected downloads;
application/payment record equality before/after actions; and concurrent generation
with number correction. Backend build and separate admin TypeScript check pass.

Admin production build: PASS with `npm run build -- --webpack` (escalated execution).
Default Turbopack build: environment failure, worker port binding denied even on
escalated retry. No build configuration was changed. Separate `npx tsc --noEmit`
passed; this matters because the existing Next config skips build-time type checks.
`git diff --check` passed. No services were restarted and no commit was made.
