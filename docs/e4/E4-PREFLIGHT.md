# E4 Preflight — MCF-CONTROL-CENTER-001

Status: `PREFLIGHT_COMPLETE / PROVISIONING_NOT_STARTED`
Date: `2026-09-02 America/Recife`
Authority: LEANDRO remains final HUMAN_GATE.

## Vercel — connected-state check

- Connected team: `PREDIX AI BR`.
- Team plan: `hobby`.
- Authenticated UI shows multiple existing projects in this team; connector project count is not trusted because of the confirmed access anomaly.
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

## Vercel connector anomaly

- Connector team ID: `team_D45x1LavGkCy2ifRlrShm2WJ`.
- Local real project `meu-primeiro-agente` has the same `orgId` and project ID `prj_rjN6H62pnhE3CH8bCOx9E7aHKZ3g`.
- Connector `list_projects(team)` returns `[]`; connector `get_project(real_project_id, same_team)` returns `404`.
- Authenticated Vercel UI visibly lists multiple projects in `PREDIX AI BR`.
- Disposition: connector project discovery/read is treated as `UNRELIABLE` for E4. Team metadata may be consulted, but project existence must be verified through authenticated UI and/or local Vercel link metadata until the connection is re-authorized externally.
- Visual evidence: `docs/evidence/e4/VERCEL-UI-SEARCH-MCF-CONTROL-CENTER.png`.
