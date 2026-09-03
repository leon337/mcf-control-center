# E4 Preflight — MCF-CONTROL-CENTER-001

Status: `PREFLIGHT_COMPLETE / PROVISIONING_NOT_STARTED`
Date: `2026-09-02 America/Recife`
Authority: LEANDRO remains final HUMAN_GATE.

## Vercel — connected-state check

- Connected team: `PREDIX AI BR`.
- Team plan: `hobby`.
- Projects currently listed in that team: `0`.
- No Vercel project was created or deployed during this preflight.

## Supabase — connected-state check

- One connected organization is available to this mission context.
- Existing projects are present in that organization.
- No project named `mcf-control-center` was found.
- Existing projects are predominantly in `sa-east-1`, consistent with the Brazil/Recife deployment strategy.

## Proposed E4 provisioning target

- Vercel project name: `mcf-control-center`.
- Supabase project name: `mcf-control-center`.
- Proposed Supabase region: `sa-east-1`.
- Vercel/Supabase remain separate infrastructure adapters; no production command capability is enabled.

## HUMAN_GATE before mutation

Before creating the Supabase project, LEANDRO must choose the target Supabase organization. The connector requires a cost lookup and explicit cost confirmation before project creation.

Vercel project creation/deployment is also kept separate from this preflight. Any authentication step, secret entry, billing/contract change, or public release remains reserved to LEANDRO.

## Preflight result

`E4_PREFLIGHT=PASS`

Provisioning has not started. No external resource, secret, database, deployment or public URL was created by this preflight.
