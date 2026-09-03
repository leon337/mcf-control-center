# E4 — Next.js Control Center Shell Design

Status: `DESIGN_APPROVED_IN_CHAT / SPEC_PENDING_USER_REVIEW`
Mission: `MCF-CONTROL-CENTER-001`
Authority: LEANDRO remains final HUMAN_GATE.

## 1. Objective

Create the smallest deployable web foundation for the MCF Control Center without rewriting or mutating the two preserved WorkBuddy artifacts.

The shell must provide stable application routes, a server-side integration boundary for Supabase/GitHub/MCF, and a deployment shape that works first on Vercel and later on the project VPS.

## 2. Source-of-truth artifacts

The originals remain canonical and immutable:

- `artifacts/originals/workbuddy/agent-apps-scene.html`
- `artifacts/originals/workbuddy/github-monitor.html`

Canonical SHA-256:

- Mission Control: `ebe1e2616f4282ac46fec6400ad043657cbdaa652e0b7a6cf97861bc5adfdf55`
- GitPulse: `c5686da41a844f5a7f67f9531ef2ad85a9ce7411383d31c98273ef6eea6c33a9`

No implementation step may edit these files in place.
## 3. Recommended architecture

Use one Next.js application as the deployable shell.

Responsibilities:

- Next.js App Router owns application routes and server-side integration endpoints.
- Preserved HTML payloads are copied, unchanged, into a public baseline directory during implementation.
- `/mission-control` renders the preserved Mission Control baseline.
- `/github` renders the preserved GitPulse baseline.
- Server-only modules own Supabase, GitHub webhook/reconciliation, and future MCF ingest access.
- Browser code never receives server credentials.

The application shell is an integration boundary around the preserved interfaces, not a visual rewrite.

## 4. Initial route contract

Required routes for the E4 shell:

- `/` — minimal Control Center landing/navigation surface.
- `/mission-control` — preserved Mission Control baseline.
- `/github` — preserved GitPulse baseline.
- `/api/health` — non-secret health response for local/preview verification.

Future E5/E6 API routes may be added only behind the server boundary defined here.
## 5. Repository shape

Target implementation layout:

```text
app/
  page.tsx
  mission-control/page.tsx
  github/page.tsx
  api/health/route.ts
lib/
  server/
public/
  originals/
    agent-apps-scene.html
    github-monitor.html
supabase/
  migrations/
```

The `public/originals/` copies are deployment artifacts. Their bytes must match the canonical files under `artifacts/originals/workbuddy/` and be verified by SHA-256 in tests.

The canonical originals remain in `artifacts/originals/workbuddy/`; the public copies are never the source of truth.

## 6. Data and secret boundary

Client/browser code must not contain:

- Supabase service-role credentials;
- GitHub private tokens;
- MCF HMAC secrets;
- deployment or infrastructure credentials.
All privileged access is server-side only.

For the first shell milestone, no client-side Supabase access is required. RLS remains default-deny until a later authenticated client use case is explicitly designed.

Public/publishable values may be introduced later only when their browser exposure is intentional and documented.

## 7. Supabase integration boundary

The already-provisioned Supabase project remains the persistence target:

- project: `mcf-control-center`;
- region: `sa-east-1`;
- ref: `kxftpqiwqjzjreqtvetn`;
- ledger tables: `source_events`, `ingest_receipts`.

E4 shell implementation does not yet expose ledger data to the browser.

The server integration must be structured so E5/E6 can add GitHub and MCF ingestion without changing the route/visual shell contract.

## 8. Preservation strategy

The first implementation must prove preservation before adding live data.

Required invariant:

`SHA256(public/originals/agent-apps-scene.html) == SHA256(artifacts/originals/workbuddy/agent-apps-scene.html)`

`SHA256(public/originals/github-monitor.html) == SHA256(artifacts/originals/workbuddy/github-monitor.html)`

A failed artifact hash is a hard test failure and blocks deploy.
## 9. Local verification before Vercel

The implementation plan must use TDD and require, at minimum:

- artifact hash test fails before the public copies exist, then passes after preservation copy is added;
- route tests for `/`, `/mission-control`, `/github`, and `/api/health`;
- production build succeeds locally;
- no secret-like values are committed;
- original canonical artifact hashes remain unchanged;
- Git working tree is clean after the verified checkpoint.

A browser smoke test must confirm both preserved interfaces render from the Next.js shell without using WorkBuddy.

## 10. Vercel boundary

The authenticated Vercel import screen already recognizes `leon337/mcf-control-center` and proposes project name `mcf-control-center` in team `PREDIX AI BR`.

Current state intentionally stops before the `Deploy` action.

Creating the application code and validating it locally does not authorize a Vercel deploy.

The first Vercel deployment/public URL requires an explicit HUMAN_GATE from LEANDRO after the local build and smoke-test evidence are presented.

No Vercel environment secret is entered through chat or committed to Git.
## 11. Error handling and observability

The shell must fail visibly and conservatively:

- health endpoint reports application availability without leaking secret/config values;
- missing server configuration produces an explicit server-side configuration error, not a silent fallback to fake data;
- preserved baseline routes remain distinguishable from future LIVE integrations;
- no UI element may label data LIVE unless its source, timestamp, and evidence/provenance contract are available.

## 12. VPS migration constraint

The app must remain a standard Node/Next.js application with no business logic dependent on proprietary Vercel-only primitives.

Vercel may host the first deployment, but persistence remains in Supabase/Postgres and integration boundaries remain ordinary HTTP/server modules.

Future VPS migration must be achievable by providing equivalent environment configuration and running the application in a standard Node/container runtime, without redesigning the product routes or data model.

## 13. Explicit non-goals for this shell

This E4 shell does not:

- implement GitHub live ingestion;
- implement MCF outbound/ingest;
- implement agent command/control;
- add authenticated browser users;
- redesign the preserved interfaces;
- merge the Draft PR;
- publish a production URL without LEANDRO approval.
## 14. Acceptance criteria

The E4 web-shell implementation is ready for the deploy HUMAN_GATE only when all are true:

1. Next.js app exists on `mission/mcf-control-center-001`.
2. Canonical WorkBuddy originals remain byte-identical to their recorded SHA-256 values.
3. Deployment copies under `public/originals/` match those same SHA-256 values.
4. `/`, `/mission-control`, `/github`, and `/api/health` pass automated/local checks.
5. Local production build succeeds.
6. Browser smoke evidence shows both preserved interfaces render outside WorkBuddy.
7. No service-role, GitHub private token, MCF HMAC secret, or other credential is committed or browser-exposed.
8. Supabase ledger remains default-deny to browser roles.
9. Architecture keeps E5/E6 integrations behind server-side modules.
10. MESTRE presents the evidence to LEANDRO before any Vercel deploy/public URL.

## 15. Decision record

LEANDRO approved the recommended approach: one Next.js shell that preserves the original HTML baselines and becomes the stable integration surface for later E5/E6 work.

The selected approach is preferred over Vite + separate Functions or raw HTML + ad-hoc Functions because it keeps routing, server APIs, testing, Vercel deployment, and later VPS migration in one coherent application boundary.

Implementation remains pending user review of this written specification and a subsequent implementation plan.
