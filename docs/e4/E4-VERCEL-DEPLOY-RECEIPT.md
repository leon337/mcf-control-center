# E4 — First Vercel Deployment Receipt

Status: VERCEL_DEPLOY_PASS / PUBLIC_BASELINE_ONLINE
Source SHA deployed: f5b493fca5b80d9cb0da0405136ff99f48f923e0
Branch: mission/mcf-control-center-001
Team: PREDIX AI BR
Project: mcf-control-center
Public URL: https://mcf-control-center.vercel.app

## Gate provenance
- HUMAN_GATE: resolved explicitly by LEANDRO before deploy.
- EMILY Task 6 review: APPROVED.
- LÉO final operational gate: APROVADO; push and Vercel deploy authorized operationally.
- GitHub push: fast-forward 96ab318 -> f5b493f, verified before deploy.

## Deployment sequence
1. First production deployment built successfully but returned 404 behind authenticated `vercel curl` because the newly created Vercel project had Framework Preset `Other` and generic output detection.
2. Project settings were corrected to Framework `Next.js` with build/install/output returned to automatic detection.
3. The same source SHA was redeployed; corrected deployment reached `Ready`.
4. Canonical production alias became public at https://mcf-control-center.vercel.app.

## Public smoke
- `/`: HTTP 200
- `/api/health`: HTTP 200, `{status:"ok",service:"mcf-control-center",mode:"baseline-shell"}`
- `/mission-control`: HTTP 200
- `/github`: HTTP 200
- `/originals/agent-apps-scene.html`: HTTP 200, 51134 bytes
- `/originals/github-monitor.html`: HTTP 200, 41878 bytes

## Public visual evidence
- `docs/evidence/e4/WEB-SHELL-MISSION-CONTROL-VERCEL.png`
- `docs/evidence/e4/WEB-SHELL-GITHUB-VERCEL.png`
- Capture mechanism: automated Google Chrome headless on authorized host; no interaction with the user's GUI.
- Mission Control screenshot SHA-256: `887d112202f9e2eb2b6dfdbf7cb2a6f47dd9e5db86fb44a9f4b68286096fb222`
- GitPulse screenshot SHA-256: `6d0f925c7d88f8067d3fc71b76457b262277df7aa61700059aff66a06c334907`

## Semantic boundary
The public shell is a deployable preserved baseline. It does **not** yet represent live MCF runtime state. Mission Control explicitly says the snapshot is not LIVE, and GitPulse explicitly says Control Center integration is not yet active.

## Secret boundary
No secret value is recorded in this receipt or committed for deployment. Vercel local authentication metadata remained outside tracked source.
