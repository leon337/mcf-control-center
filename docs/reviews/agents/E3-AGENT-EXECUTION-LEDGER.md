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

- Canonical handoff session: `session-339b756b-3e3a-4e4f-8e49-a83d917c5232`
- Preset: `mcf-rafael`
- Provider: `nvidia-nim`
- Model: `deepseek-ai/deepseek-v4-flash-0731`
- Catalog label: `DeepSeek V4 Flash 0731 — NVIDIA Free Endpoint`
- Input includes Sofia's completed architecture review.
- Status: `completed` — official E3 engineering handoff.
- Official review: `docs/reviews/agents/RAFAEL-E3-ENGINEERING-REVIEW.md`
- Official review SHA-256: `bbe49a48ffceee9ad6a31660d27c9b7312fe7bdf29f08bd569564c8d88b66be0`
- Final assistant event seq: `4644`
- Final Harness snapshot: `docs/evidence/agents/RAFAEL-E3-HARNESS-SNAPSHOT-FINAL.json`
- Final visual evidence: `docs/evidence/agents/RAFAEL-E3-HARNESS-VISUAL-FINAL.png`
- Real Harness window capture while active: `docs/evidence/agents/RAFAEL-E3-HARNESS-WINDOW-ACTIVE.png`
- Provenance check: official review content matches the final assistant text of `session-339b...` ignoring only the repository's final newline.

### Rafael duplicate / alternate sessions

- `session-329f5daa-4b8c-4317-bb57-6ea771cb3064` — `UNUSED`, prepared before Sofia handoff.
- `session-648426d3-528f-447a-9bea-bf00144ed70f` — canonical preset but duplicate execution; renamed `ALTERNATE — RAFAEL E3 duplicate — not canonical chain`.
- Its output is preserved as `docs/reviews/agents/RAFAEL-E3-ENGINEERING-REVIEW-ALTERNATE-session-648.md` but is **not** the official handoff.

## RICARDO

- `session-2a2779d8-c8c1-4acd-ba7b-52983fa25f09` — legacy security review from before the current evidence chain; renamed `LEGACY` and not reused.
- `session-fbbf4293-dba9-40ca-b565-5a7334ae0b01` — prepared blank session; renamed `UNUSED — RICARDO prepared before Rafael handoff`.
- `session-a7f7588a-c41b-4b6e-aa96-563d6ad8ba1e` — **INVALIDATED and cancelled** after provenance check proved its handoff used Rafael's alternate `session-648` review instead of the official `session-339` output.
- The invalidated call is retained as evidence of the detected provenance mismatch; none of its output is accepted in the mission chain.
- Official corrected session: `session-1309a6bd-e33f-490b-8afa-d2b3783f430b`
- Preset: `mcf-ricardo`
- Provider: `z-ai`
- Model: `glm-4.7-flash` (`GLM-4.7 Flash — Free`)
- Workspace: `/tmp/mcf-control-center-e3-ricardo-v3` (source files OS-read-only)
- Official Rafael input SHA-256: `bbe49a48ffceee9ad6a31660d27c9b7312fe7bdf29f08bd569564c8d88b66be0`
- Prompt SHA-256: `b9151a12bd6cd2305a0f771fa9c3183ab1941af033eb337f371583171cebfae0`
- Pre-handoff snapshot: `docs/evidence/agents/RICARDO-E3-HARNESS-SNAPSHOT-BEFORE-OFFICIAL.json`
- Pre-handoff visual: `docs/evidence/agents/RICARDO-E3-HARNESS-VISUAL-BEFORE-OFFICIAL.png`
- Status: `completed` — official security review after corrected Rafael handoff.
- Decision: `APROVADO COM CORREÇÕES CRÍTICAS OBRIGATÓRIAS`.
- Official review: `docs/reviews/agents/RICARDO-E3-SECURITY-REVIEW.md`.
- Official review SHA-256: `9153c522f8bcc2c45aa68a6f6cd1e607b586a94859a45cd78d5abc99d42a631c`.
- Final assistant event seq: `11034`.
- Final Harness snapshot: `docs/evidence/agents/RICARDO-E3-HARNESS-SNAPSHOT-FINAL.json`.
- Real Harness window capture after completion: `docs/evidence/agents/RICARDO-E3-HARNESS-WINDOW-FINAL.png`.
- Human permission request to write `SECURITY-REVIEW-RICARDO.md` was explicitly denied by LEANDRO/MESTRE; Ricardo completed by chat only.
- Provenance: final review was extracted directly from assistant event `11034` of the official session.

## EMILY

- Prepared blank session: `session-097431f9-f27b-49e4-8aff-348ebc341be7` (`mcf-emily`) — not used.
- First audit attempt: `session-eb7d85d7-8ef0-4b98-bbd3-75d6e1b080f2`, preset `mcf-emily`, provider/model `nvidia-nim / minimaxai/minimax-m3`.
- Disposition of first attempt: `ABORTED — RATE_LIMIT`; NVIDIA returned HTTP 429 for all 5 automatic retries before any audit verdict. No output from that session is accepted as an Emily opinion.
- Official retry session: `session-bb36307a-5935-4c3e-ae3f-67938df0a87f`.
- Preset: `mcf-emily`.
- Provider/model: `z-ai / glm-4.5-flash` (`GLM-4.5 Flash — Free`).
- Workspace: `/tmp/mcf-control-center-e3-emily-v1` (OS-read-only).
- Inputs include canonical Sofia, Rafael and Ricardo reviews plus this execution ledger.
- Official pre-handoff snapshot: `docs/evidence/agents/EMILY-E3-HARNESS-SNAPSHOT-BEFORE-OFFICIAL.json`.
- Official pre-handoff visual: `docs/evidence/agents/EMILY-E3-HARNESS-VISUAL-BEFORE-OFFICIAL.png`.
- Status: `completed` — official independent audit.
- Official audit: `docs/reviews/agents/EMILY-E3-INDEPENDENT-AUDIT.md`.
- Official audit SHA-256: `b520597bf03d2bdf1b690943e42fb18b395d2c2bfc6863a4fda1770f703fadb4`.
- Final assistant event seq: `3681`.
- Verdict: `LIBERAR E3 COM REMEDIAÇÃO`.
- Final Harness snapshot: `docs/evidence/agents/EMILY-E3-HARNESS-SNAPSHOT-FINAL.json`.
- Final visual evidence: `docs/evidence/agents/EMILY-E3-HARNESS-VISUAL-FINAL.png`.
- Independence limitation recorded: same Harness/executor, different canonical preset and model; no claim of fully independent infrastructure.

## SOFIA — Projection workshop pre-Pattern-B (legacy)

- Session: `session-cc9f372c-193b-4d54-b4c0-ac9d0e6d1273`.
- Preset: `mcf-sofia`.
- CWD: `/tmp/mcf-control-center-e3-projections-sofia`.
- The earlier pre-call snapshot correctly recorded `promptSent=false` **at capture time**, but the session was subsequently prompted and completed.
- Final assistant event seq: `3237`.
- Preserved output: `docs/reviews/agents/SOFIA-E3-PROJECTION-WORKSHOP-REVIEW-PRE-PATTERN-B.md`.
- Output SHA-256: `94f5e0c658d4a107341892ef95f2906e5c93bc2f37aa9e9dc91e6d2d7a39abc8`.
- Disposition: `LEGACY PRE-PATTERN-B — completed but excluded from the Pattern B canonical reconciliation chain`.
- Reason: the session predates the approved persistent workspace-per-agent+mission topology. Its findings may be consulted as historical evidence, but the canonical post-migration SOFIA review will be re-run in the isolated Pattern B workspace.

## SOFIA — E3C Pattern B permission-gate incident

- Transient session: `session-a48ef80d-bfe7-45d9-8f9b-b64221dd81bb`.
- Workspace: `MCF-CONTROL-CENTER-001 — SOFIA`.
- Preset: `mcf-sofia`.
- Disposition: `INVALID — permission command misrouted through session.prompt`.
- The attempted `/permission read-only` was incorrectly sent as prompt content; the gate detected `blank=false` and `permission=workspace-write` before the actual SOFIA task.
- No E3C cognitive task was sent to that session and none of its output is accepted.
- The transient session later disappeared from `session.list`; incident evidence is preserved as `SOFIA-E3C-PATTERN-B-INVALID-PERMISSION-MISROUTE.json`.

## SOFIA — E3C Pattern B canonical retry (prepared)

- Session: `session-7c6fe628-cbe2-4d14-b493-2d82b1686a84`.
- Workspace ID: `81cc5ad0-e681-4fb9-b4ab-b5cc91a80faa`.
- Workspace path: `/var/tmp/mcf-control-center-001/sofia`.
- Preset: `mcf-sofia`.
- Permission: `read-only`, applied through the Host `commands/execute` RPC while the session remained blank.
- Provider/model: `nine-router-kiro / kr/claude-sonnet-4.5`.
- Pre-prompt gate: `blank=true`, `running=false`, no `user/message`, no `assistant/message`, correct workspace membership.
- Pre-call evidence: `docs/evidence/agents/SOFIA-E3C-PATTERN-B-SNAPSHOT-BEFORE.json` + `SOFIA-E3C-PATTERN-B-VISUAL-BEFORE.png`.
- Prompt evidence: `docs/evidence/agents/SOFIA-E3C-PATTERN-B-PROMPT.txt` (SHA recorded in snapshot).
- Status at this ledger checkpoint: `PREPARED — prompt not yet sent`.

## SOFIA — E3C Pattern B canonical completion

- Session: `session-7c6fe628-cbe2-4d14-b493-2d82b1686a84`.
- Workspace: `MCF-CONTROL-CENTER-001 — SOFIA` (`/var/tmp/mcf-control-center-001/sofia`).
- Preset: `mcf-sofia`; permission: `read-only`.
- Provider/model: `nine-router-kiro / kr/claude-sonnet-4.5`.
- Final assistant event seq: `2649`; history complete; `running=false`.
- Canonical review: `docs/reviews/agents/SOFIA-E3-PROJECTION-WORKSHOP-REVIEW.md`.
- Review SHA-256: `dc0d56e70c2bba5620ecfe3f16cd9dadb6f9a0000e0244825380f86f28945253`.
- Final snapshot: `docs/evidence/agents/SOFIA-E3-PATTERN-B-SNAPSHOT-FINAL.json`.
- Disposition: `CANONICAL PATTERN-B — COMPLETE`.

## RAFAEL — E3C Pattern B canonical completion

- Session: `session-94f1bee4-9cc9-4a28-af07-b06e3ab5598f`.
- Workspace: `MCF-CONTROL-CENTER-001 — RAFAEL` (`/var/tmp/mcf-control-center-001/rafael`).
- Preset: `mcf-rafael`; permission: `read-only`.
- Provider/model: `nvidia-nim / deepseek-ai/deepseek-v4-flash-0731`.
- Final assistant event seq: `4146`; history complete; `running=false`.
- Canonical review: `docs/reviews/agents/RAFAEL-E3-PATTERN-B-ENGINEERING-REVIEW.md`.
- Review SHA-256: `b83f592c6898be312a4c4f2fe536b7c9b8082916d3050759776f72f3214e76c2`.
- Final snapshot: `docs/evidence/agents/RAFAEL-E3-PATTERN-B-SNAPSHOT-FINAL.json`.
- Visual evidence: API-derived `RAFAEL-E3-PATTERN-B-VISUAL-BEFORE.svg` and `RAFAEL-E3-PATTERN-B-VISUAL-FINAL.svg`; no GUI interaction.
- Disposition: `CANONICAL PATTERN-B — COMPLETE`.

## EMILY — E3C Pattern B final audit — initial verdict challenged

- Session: `session-49b7c915-897a-4f4c-9699-0c0711a651c5`.
- Workspace: `MCF-CONTROL-CENTER-001 — EMILY`.
- Preset: `mcf-emily`; permission `read-only`.
- Provider/model: `z-ai / glm-4.5-flash`.
- Final assistant seq: `7591`; `running=false`.
- Exact output: `docs/reviews/agents/EMILY-E3C-PATTERN-B-FINAL-AUDIT.md`.
- Output SHA-256: `89f59ae13f880c674b48459ac757f88f41d54a8b39db073fd53e742760eacb03`.
- Visual post-delivery: `docs/evidence/agents/EMILY-E3C-PATTERN-B-WINDOW-FINAL.png`, SHA `87cace025f32b7cdc67fe5c56a5f5578e0d48b4714dccb872c876970980042e8`.
- Initial verdict: `E3_NAO_PODE_FECHAR`.
- Disposition: `CHALLENGED — factual contradictions detected against the reconciled contract and canonical enum; verdict is not accepted until a clean revalidation session adjudicates those discrepancies`.
- Revalidation is required because the initial report claims 42 canonical event types while the frozen enum has 30, treats `PHASE_STARTED`, `PHASE_COMPLETED`, and `HANDOFF_CREATED` as non-canonical although they are present, and attributes draft-only invalid event names to reconciled documents where they no longer occur.
