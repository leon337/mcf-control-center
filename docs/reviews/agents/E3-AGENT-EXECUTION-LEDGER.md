# E3 — Agent Execution Ledger

Mission: `MCF-CONTROL-CENTER-001`
Coordinator: `MESTRE`
Human authority: `LEANDRO`
Execution surface: DeepSeek Harness local API (`127.0.0.1:3081`)

## Execution policy

- Use canonical MCF agent presets, never prompt-only impersonation.
- Use separate persistent Harness sessions per agent.
- Keep source workspace read-only during reviews.
- Prefer routes explicitly labeled `Free` by the local Harness catalog.
- A `Free` catalog label does not prove a particular remaining quota; no paid route is intentionally selected in E3.
- Agent output is evidence input, not automatic truth; MESTRE reconciles and Emily audits.
- Visual evidence is mandatory per agent call: pre-call/active-session identity plus post-delivery evidence, tied to Harness session metadata and SHA-256 snapshots.

## Invalidated attempt

- Session: `session-493cb9ff-ba0d-49ee-ae34-e2452451baaf`
- Intended agent: SOFIA
- Actual preset: `mcf-leo`
- Disposition: cancelled and renamed `INVALID — SOFIA attempt — wrong preset mcf-leo`
- Reason: system identity was LÉO, so output could not be accepted as Sofia's review.

## SOFIA

- Session: `session-225e0961-143a-4392-8680-92f8b9fa7d98`
- Preset: `mcf-sofia`
- Provider: `nine-router-kiro`
- Model: `kr/claude-sonnet-4.5`
- Catalog label: `Claude Sonnet 4.5 — Kiro Free (1.3x)`
- Status: completed
- Verdict: `APROVADA COM CORREÇÕES`
- Material findings: 2 blockers, 5 non-blockers
- Review: `SOFIA-E3-ARCHITECTURE-REVIEW.md`
- Review SHA-256: `64fa513ab61111d9e9c72368567716ad1aec1b87c756aa480b3a12ca5c1f30d4`
- Visual evidence: `docs/evidence/agents/SOFIA-E3-HARNESS-VISUAL.png`
- Harness snapshot: `docs/evidence/agents/SOFIA-E3-HARNESS-SNAPSHOT.json`
- Snapshot SHA-256: `4535d21a740f3ed18fe1a065d2706ef24684537efb1b6bb43889eed3a75889a2`

## RAFAEL

- Prepared session `session-329f5daa-4b8c-4317-bb57-6ea771cb3064` was cancelled before prompt and renamed `UNUSED — RAFAEL prepared before Sofia handoff`.
- Active handoff session: `session-339b756b-3e3a-4e4f-8e49-a83d917c5232`
- Preset: `mcf-rafael`
- Provider: `nvidia-nim`
- Model: `deepseek-ai/deepseek-v4-flash-0731`
- Catalog label: `DeepSeek V4 Flash 0731 — NVIDIA Free Endpoint`
- Input includes Sofia's completed architecture review.
- Status: running / engineering review
- Active visual evidence: `docs/evidence/agents/RAFAEL-E3-HARNESS-VISUAL.png`
- Harness snapshot: `docs/evidence/agents/RAFAEL-E3-HARNESS-SNAPSHOT.json`
- Snapshot SHA-256: `d57d77ac8bbd138115caa1863428db0a54e5d7e7800db157d0fa2928a2ae2a64`

## RICARDO / EMILY

Canonical sessions are prepared but have not received mission prompts yet. They will only be dispatched after the preceding handoff evidence exists.
