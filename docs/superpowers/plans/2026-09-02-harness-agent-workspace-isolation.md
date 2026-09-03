# Harness Agent Workspace Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate future `MCF-CONTROL-CENTER-001` agent calls to Pattern B: one persistent Harness workspace per agent + mission, with explicit context packets and no shared ambient workspace.

**Architecture:** Register `/var/tmp/mcf-control-center-001/sofia`, `/leo`, `/rafael`, `/ricardo` and `/emily` as five distinct Harness workspaces. Create sessions with `session.create {workspaceId}`, apply the canonical preset while blank, validate the tuple through Host APIs, then send only explicit handoff prompts. Historical sessions are preserved unchanged.

**Tech Stack:** DeepSeek Harness 0.1.1-rc.2 local HTTP RPC, Linux filesystem, Git, SHA-256, Markdown/JSON evidence.

**Spec:** `docs/superpowers/specs/2026-09-02-harness-agent-workspace-isolation-design.md`

## Global Constraints

- Pattern B is approved by LEANDRO.
- Existing `MCF — LÉO CANÔNICO` and historical `Ungrouped` sessions are not moved or deleted.
- Workspace root: `/var/tmp/mcf-control-center-001`.
- Review inputs are copies only; no repository/workspace symlinks.
- Review packets are OS-read-only before the first prompt.
- A prompt is forbidden until workspace, cwd, preset and blank-session state are verified.
- HUMAN_GATE remains LEANDRO.

---
### Task 1: Freeze the pre-Pattern-B baseline

**Files:**
- Create: `docs/evidence/harness/PRE-PATTERN-B-WORKSPACE-LIST.json`
- Create: `docs/evidence/harness/PRE-PATTERN-B-SESSION-LIST.json`
- Modify: `docs/reviews/agents/E3-AGENT-EXECUTION-LEDGER.md`
- Preserve: `docs/evidence/agents/SOFIA-E3-PROJECTIONS-SNAPSHOT-BEFORE.json`
- Preserve: `docs/evidence/agents/SOFIA-E3-PROJECTIONS-VISUAL-BEFORE.png`

**Interfaces:**
- Consumes: Harness read-only `workspace.list` and `session.list` RPCs.
- Produces: immutable baseline proving the old topology and the completed Sofia pre-Pattern-B session, which is preserved as legacy but excluded from the Pattern B canonical chain.

- [ ] **Step 1: Save current workspace registry**

Call `/api/workspace.list` with RPC method `workspace.list`, payload `{}` and save the complete successful response.

- [ ] **Step 2: Save current session registry**

Call `/api/session.list` with RPC method `session.list`, payload `{}` and save the complete successful response.

- [ ] **Step 3: Classify the Sofia pre-Pattern-B execution correctly**

Preserve the exact final assistant message from `session-cc9f372c-193b-4d54-b4c0-ac9d0e6d1273`, record that the earlier `promptSent=false` snapshot was only a pre-call state, and classify the completed session as `LEGACY PRE-PATTERN-B — excluded from Pattern B canonical chain`.

- [ ] **Step 4: Verify no historical mutation**

Re-run `workspace.list`; the only pre-existing registered workspace must still be `dc426e8f-21b7-441f-a639-2e1957a42db8` / `MCF — LÉO CANÔNICO` before Task 2 begins.

- [ ] **Step 5: Commit the baseline**

Run `git diff --check`, then commit the baseline/evidence before any workspace registration write.

### Task 2: Build and register five isolated workspaces

**Files:**
- Create runtime dirs: `/var/tmp/mcf-control-center-001/{sofia,leo,rafael,ricardo,emily}`
- Create in each: `WORKSPACE-MANIFEST.json`, `input/00-MISSION.md`, `input/10-BASELINE.md`, `input/20-HANDOFF.md`
- Create: `docs/evidence/harness/PATTERN-B-WORKSPACE-LIST.json`

**Interfaces:**
- Consumes: existing source documents copied into agent-specific packets.
- Produces: five distinct Harness Workspace IDs and paths.

- [ ] **Step 1: Create the physical directories**

Create `/var/tmp/mcf-control-center-001/{sofia,leo,rafael,ricardo,emily}/input`. Do not place symlinks in any of those trees.

- [ ] **Step 2: Populate minimal context packets**

For every agent, write mission identity, role, allowed sources and current handoff only. Compute SHA-256 for every copied source and write those hashes to `WORKSPACE-MANIFEST.json`.

- [ ] **Step 3: Make review packets read-only**

Set packet files to `0444` and workspace/input directories to `0755` owned by `leo`. Verify an ordinary write attempt to a packet file fails before adopting the path.

- [ ] **Step 4: Register each directory**

Call `/api/workspace.create` once for each of the five explicit paths above. Parse the successful responses into `SOFIA_WORKSPACE_ID`, `LEO_WORKSPACE_ID`, `RAFAEL_WORKSPACE_ID`, `RICARDO_WORKSPACE_ID`, and `EMILY_WORKSPACE_ID`; abort if any response is not `ok:true`.

- [ ] **Step 5: Rename display titles**

Call `/api/workspace.rename` for the five saved IDs with titles exactly `MCF-CONTROL-CENTER-001 — SOFIA`, `— LÉO`, `— RAFAEL`, `— RICARDO`, and `— EMILY`.

- [ ] **Step 6: Verify registry isolation**

Run `workspace.list` and require five new records with five unique IDs and five unique canonical paths. Save the response as `PATTERN-B-WORKSPACE-LIST.json`.

- [ ] **Step 7: Commit workspace evidence**

Commit only repository evidence/docs. `/var/tmp` packet contents remain runtime artifacts and are represented by their manifests/hashes.

### Task 3: Prove one safe Pattern B invocation with SOFIA

**Files:**
- Create: `docs/evidence/agents/SOFIA-E3-PATTERN-B-SNAPSHOT-BEFORE.json`
- Create: `docs/evidence/agents/SOFIA-E3-PATTERN-B-VISUAL-BEFORE.png`
- Create after completion: `docs/reviews/agents/SOFIA-E3-PROJECTION-WORKSHOP-REVIEW.md`
- Create after completion: `docs/evidence/agents/SOFIA-E3-PATTERN-B-SNAPSHOT-FINAL.json`

**Interfaces:**
- Consumes: Sofia workspace ID, `mcf-sofia`, LÉO's canonical projection-semantics review and E3 source packet.
- Produces: first post-migration agent opinion with verified workspace/session/preset provenance.

- [ ] **Step 1: Create a blank session in Sofia's workspace**

Call `/api/session.create` with method `session.create` and payload `{"workspaceId":"$SOFIA_WORKSPACE_ID"}`. Do not prompt it.

- [ ] **Step 2: Select the canonical preset while blank**

Call `/api/agentPreset.select` with method `agentPreset.select` and payload `{"sessionId":"<new-session-id>","agentPreset":"mcf-sofia"}`.

- [ ] **Step 3: Verify the identity tuple before model/prompt**

Run `session.list` and require for the new id: `cwd=/var/tmp/mcf-control-center-001/sofia`, `agentPreset=mcf-sofia`, `blank=true`, `running=false`. Any mismatch invalidates the session before a prompt is sent.

- [ ] **Step 4: Select Sofia's proven route**

Call `/api/session.selectModel` with method `session.selectModel` and payload `{"sessionId":"$SOFIA_SESSION_ID","provider":"nine-router-kiro","model":"kr/claude-sonnet-4.5"}`. Confirm the returned selected tuple and verify it again with `session.models`.

- [ ] **Step 5: Persist pre-call evidence**

Save API snapshot containing workspace ID/path, session ID/cwd, preset, provider/model, packet hashes and `promptSent=false`; render the standard visual evidence card from that snapshot.

- [ ] **Step 6: Send the controlled handoff**

Call `/api/session.prompt` with method `session.prompt` and payload containing `sessionId`, `mode:"queue"`, one text content part, and `clientTimeZone:"America/Recife"`. The prompt instructs Sofia to review LÉO's projection semantics against the copied sources, remain read-only, and return the opinion in chat.

- [ ] **Step 7: Handle permissions safely**

If Sofia requests workspace write permission, deny it. The review must finish in chat; no review file is authored by the agent inside `/var/tmp`.

- [ ] **Step 8: Close provenance**

After completion, use `session.history` to extract the exact final assistant message, save it as `SOFIA-E3-PROJECTION-WORKSHOP-REVIEW.md`, hash it, capture final session metadata and commit the evidence.

### Task 4: Continue E3 only through isolated handoffs

**Files:**
- Create: `docs/reviews/agents/RAFAEL-E3-PROJECTION-CLOSURE.md`
- Update: `docs/contracts/MCF-CONTROL-EVENT-v1.md`
- Update: `docs/architecture/E3-CONTROL-CENTER-ARCHITECTURE.md`
- Update: `docs/reviews/agents/E3-AGENT-EXECUTION-LEDGER.md`

**Interfaces:**
- Consumes: canonical LÉO projection review + Pattern B Sofia review.
- Produces: engineering closure and reconciled E3 documents before any E4 implementation.

- [ ] **Step 1: Refresh Rafael's explicit packet**

As owner `leo`, replace only Rafael's packet copies with the canonical LÉO and Sofia outputs, update hashes in `WORKSPACE-MANIFEST.json`, then return source files to `0444`.

- [ ] **Step 2: Create and verify a fresh Rafael session**

Use Rafael's registered `workspaceId`, then apply `mcf-rafael` while blank. Require `cwd=/var/tmp/mcf-control-center-001/rafael`, correct preset and `blank=true` before sending a prompt.

- [ ] **Step 3: Run Rafael engineering closure**

Use a route verified by `session.models`, ask Rafael to resolve only the contract/schema engineering questions raised by LÉO/Sofia, and keep the workspace read-only.

- [ ] **Step 4: Reconcile, do not blindly merge opinions**

MESTRE compares LÉO, Sofia and Rafael, updates the event contract/architecture only where evidence supports the change, and records disagreements explicitly.

- [ ] **Step 5: Final isolated Emily verification**

Refresh Emily's Pattern B packet with the reconciled documents and canonical agent outputs. Create a fresh `mcf-emily` session in `/var/tmp/mcf-control-center-001/emily`; ask for a read-only verification of whether E3 remediation conditions are satisfied.

- [ ] **Step 6: Close the migration acceptance test**

Require `workspace.list` to show all Pattern B workspaces, and `session.list` to show every new reconciliation session under exactly one matching cwd/workspace. Newly created sessions must not appear in `Ungrouped`.

- [ ] **Step 7: Update the living checklist**

Mark workspace isolation implemented, record all new workspace/session IDs and evidence commit SHAs, and only mark E3 complete if Emily's final verification and MESTRE reconciliation satisfy the E3 gates.

- [ ] **Step 8: Commit and push**

Run `git diff --check`, inspect `git status`, commit the reconciled E3 artifacts/evidence, push the mission branch, and update PR #2 / Issue #1. Do not merge the PR as part of this plan.

## Rollback rule

The migration is additive. If any Pattern B workspace or session fails validation, stop before prompting, keep historical records intact, mark the failed new record as unused/invalid, and create a fresh corrected record. Never fall back to the shared workspace or `Ungrouped` for convenience.
