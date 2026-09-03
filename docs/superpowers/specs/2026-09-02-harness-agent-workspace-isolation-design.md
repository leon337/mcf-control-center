# Harness Agent Workspace Isolation — Design

Mission: `MCF-CONTROL-CENTER-001`
Decision: **Pattern B approved by LEANDRO**
Status: `APPROVED_DESIGN_PENDING_MIGRATION`

## Goal

Prevent cross-agent context contamination in DeepSeek Harness by giving every agent a mission-scoped workspace, session, preset and explicit handoff packet.

## Canonical naming

Workspace title:
`MCF-CONTROL-CENTER-001 — <AGENT>`

Persistent local path:
`/var/tmp/mcf-control-center-001/<agent-slug>`

Examples:
- `MCF-CONTROL-CENTER-001 — SOFIA` → `/var/tmp/mcf-control-center-001/sofia`
- `MCF-CONTROL-CENTER-001 — LÉO` → `/var/tmp/mcf-control-center-001/leo`
- `MCF-CONTROL-CENTER-001 — RAFAEL` → `/var/tmp/mcf-control-center-001/rafael`
- `MCF-CONTROL-CENTER-001 — RICARDO` → `/var/tmp/mcf-control-center-001/ricardo`
- `MCF-CONTROL-CENTER-001 — EMILY` → `/var/tmp/mcf-control-center-001/emily`

## Isolation invariants

1. One agent + one mission = one Harness workspace.
2. One agent identity = one canonical preset (`mcf-<agent>`).
3. A new handoff uses a fresh session; prompt-only impersonation is forbidden.
4. No mission session is created in `MCF — LÉO CANÔNICO`.
5. No new mission session remains `Ungrouped` after workspace creation succeeds.
6. Historical E3 sessions remain untouched and retain their current grouping as provenance evidence.
7. Agent workspaces never mount the complete MCF or Control Center repository during review.
8. Each review workspace receives only files explicitly listed in its handoff manifest.
9. No symlink from an agent workspace to another agent workspace or to a full source repository.
10. Review workspaces are OS-read-only to the agent; output is returned in Harness chat and preserved by MESTRE.
11. Every call records workspace ID, path, session ID, preset, provider/model, prompt hash and pre/post visual evidence.
12. LEANDRO remains the only HUMAN_GATE authority.

## Existing-state treatment

`MCF — LÉO CANÔNICO` is a pre-existing shared Harness workspace containing sessions from multiple agents and earlier missions. It is preserved unchanged and is not considered an isolated workspace for this mission.

The current E3 `Ungrouped` sessions are historical evidence. They are not moved or rewritten because changing their grouping would make provenance harder to audit.

The migration is forward-only: the next agent invocation starts in the new Pattern B topology.

## Handoff packet structure

Each workspace contains a mission-specific packet, not ambient repository context:

```text
/var/tmp/mcf-control-center-001/<agent>/
├── WORKSPACE-MANIFEST.json
└── input/
    ├── 00-MISSION.md
    ├── 10-BASELINE.md
    └── 20-HANDOFF.md
```

`WORKSPACE-MANIFEST.json` records:
- `mission_id`;
- `agent_id` and canonical preset;
- workspace title/path;
- handoff/round ID;
- every input file with SHA-256 and source path;
- permission mode;
- creation timestamp.

The packet contains copies, not links. A later agent sees a prior agent's output only when MESTRE explicitly includes that output in `20-HANDOFF.md` or as a separately hashed input.

This turns agent-to-agent communication into an auditable handoff rather than shared hidden context.

## Review permissions

For E3 review/reconciliation:
- workspace directories are `0755` owned by `leo`: MESTRE can refresh packets, while the Harness `sentinelx` process has read/execute but no directory write permission;
- source packets are immutable for the duration of a session;
- permission requests for workspace writes are denied;
- MESTRE extracts final chat output and commits it to the mission repository.

For later implementation phases, write access is a separate design concern: an implementation agent must receive its own Git worktree/branch rather than sharing another agent's writable tree.

## Reconciliation workflow

The Emily recommendation for a `SOFIA + LÉO + Rafael` workshop is implemented as controlled sequential handoffs, not a shared chat:

```text
MESTRE → SOFIA workspace/session → Sofia opinion
       → LÉO workspace/session   → operational decision
       → RAFAEL workspace/session → engineering closure
       → MESTRE reconciliation
```

Each transition carries only the explicit packet selected by MESTRE. Cross-agent session history is never inherited.

## Acceptance criteria

- Five Pattern B workspaces exist and are returned by `workspace.list` with distinct IDs and paths.
- A fresh session created for an agent is associated only with that agent's workspace.
- Preset identity matches the intended agent before a prompt is sent.
- Review workspace cannot modify its source packet.
- No newly created reconciliation session appears in `Ungrouped`.
- Visual evidence and API snapshots prove workspace/session/preset/model mapping.
- Old shared/ungrouped sessions remain unchanged and clearly marked historical.

## Rollback and failure policy

Workspace creation is additive. Existing workspace/session records are never deleted as part of this migration.

If creation or adoption of any new workspace fails:
- stop before sending a prompt;
- record the failed workspace/path/API result;
- keep that agent uninvoked;
- do not fall back to `Ungrouped` or `MCF — LÉO CANÔNICO`;
- correct the topology first, then retry with a fresh session.

If preset, workspace or model evidence disagrees with the intended call, the session is `INVALID` and its output cannot enter the canonical chain.

## Scope boundary

This design changes Harness execution isolation only. It does not alter agent contracts, MCF HUMAN_GATE authority, the Control Center product architecture, GitHub history, or the historical sessions already produced in E3.

## Evidence-based nuance about `Ungrouped`

Harness groups a session into a Workspace only when the session header `cwd` canonically equals the registered Workspace path.

Therefore `Ungrouped` means "cwd is not registered as a Workspace", not "all ungrouped sessions share context".

Current E3 evidence shows LÉO used `/tmp/mcf-control-center-e3-projections-leo` and the prepared Sofia session used `/tmp/mcf-control-center-e3-projections-sofia`; those paths were already distinct. No cross-agent filesystem contamination is proven for those two sessions.

Pattern B improves this by making distinct cwd paths persistent, registered, named and provable through `workspace.list`, instead of relying on transient `/tmp` directories and the `Ungrouped` bucket.
