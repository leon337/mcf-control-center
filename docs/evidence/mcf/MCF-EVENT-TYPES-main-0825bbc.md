# MCF Runtime — McfEventType evidence

Mission: `MCF-CONTROL-CENTER-001`
Source of truth: `leon337/multiagent-collaboration-framework`
Verified branch head: `main@0825bbcfa1c9e8a07c08d9ff7d9ecbcc51186b22`
Source file: `apps/rede-social-agentes/packages/contracts/src/mcf-runtime.ts`
Source blob SHA: `fb47c4cf04c15ad5ed0cbf70370ee184825e2ac6`
Verified from live GitHub connector on 2026-09-02.

Canonical `McfEventType` values at this commit:

- `MISSION_CREATED`
- `MISSION_STATE_CHANGED`
- `SUBMISSION_OPENED`
- `PARENT_RETURN_COMPLETED`
- `PARENT_RETURN_DEFERRED`
- `PARENT_MISSION_RESUMED`
- `PHASE_STARTED`
- `SKILL_SELECTED`
- `PERMISSION_GRANTED`
- `PERMISSION_DENIED`
- `TOOL_REQUESTED`
- `TOOL_RECEIPT_RECORDED`
- `EVIDENCE_VALIDATED`
- `EVIDENCE_REJECTED`
- `EXTERNAL_ACTION_REQUESTED`
- `EXTERNAL_ACTION_ALLOWED`
- `EXTERNAL_ACTION_EXECUTED`
- `EXTERNAL_ACTION_FAILED`
- `EXTERNAL_ACTION_EVIDENCE_VALIDATED`
- `EXTERNAL_ACTION_ABANDONED`
- `HANDOFF_CREATED`
- `RECOVERY_STARTED`
- `RECOVERY_COMPLETED`
- `GATE_REQUIRED`
- `GATE_APPROVED`
- `GATE_REJECTED`
- `PHASE_COMPLETED`
- `MISSION_COMPLETED`
- `MISSION_BLOCKED_ALERT_RAISED`
- `CI_CALLBACK_RECEIVED`

Decision: the Control Center v1 contract must use these Runtime-native names when an outbound event directly represents an `mcf_events` row. Synthetic Control Center health events, if needed, must use a separate namespace and may not masquerade as Runtime-native `McfEventType` values.
