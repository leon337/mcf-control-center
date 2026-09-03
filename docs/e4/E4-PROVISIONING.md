# E4 Provisioning Receipt — MCF-CONTROL-CENTER-001

Status: `SUPABASE_PROVISIONED / VERCEL_NOT_DEPLOYED`
Date: `2026-09-02 America/Recife`
Authority: LEANDRO remains final HUMAN_GATE.

## Supabase project

- Organization: `leon337's Org` (`lkjxqlllmbsovatsapfr`).
- Project: `mcf-control-center`.
- Project ref: `kxftpqiwqjzjreqtvetn`.
- Region: `sa-east-1`.
- Status after creation: `ACTIVE_HEALTHY`.
- API URL: `https://kxftpqiwqjzjreqtvetn.supabase.co`.
- Cost confirmed before creation: `US$ 0/month`.

## Free-plan slot management

- `estoque-mercearia` was paused only after explicit LEANDRO authorization.
- Project ref: `exwtngpwqgkrkoszpgib`.
- Final observed status: `INACTIVE`.
- `cognitive-ledger` was not modified.

## Database foundation

Applied Supabase migrations:

1. `20260903013522_e4_create_ingest_ledger`
2. `20260903013650_e4_harden_ingest_ledger`

Created ledger objects:

- `public.source_events`
- `public.ingest_receipts`
- append-only UPDATE/DELETE rejection trigger on both tables
- required indexes for mission/source/type/timestamp and receipt relationships
- RLS enabled on both tables
- `anon` and `authenticated` table privileges revoked

TDD gate:

- RED: query against `public.source_events` failed with PostgreSQL `42P01 relation does not exist` before migration.
- GREEN: both tables exist, RLS=true, client SELECT privileges=false, both append-only triggers present.
- Transactional UPDATE test was rejected by append-only trigger.
- Invalid `mcf-runtime` event with `signature_status='not_required'` was rejected.
- Transaction rolled back with `0` residual test rows.

## Advisor disposition

Security advisor after hardening:

- no remaining WARN/ERROR finding on the append-only function;
- `RLS enabled no policy` remains INFO and is intentional default-deny until browser Auth/RLS policies are introduced.

Performance advisor after hardening:

- unindexed `prior_receipt_id` finding resolved;
- remaining `unused_index` INFO findings are expected on a new empty database and are not removed.

## Vercel boundary

- Authenticated UI confirms no exact `mcf-control-center` project exists yet.
- Vercel connector remains unreliable for project discovery/read in this mission.
- No Vercel project/deployment/public URL has been created by this provisioning step.
- Public deployment remains a separate HUMAN_GATE.
