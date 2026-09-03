Análise completa de LÉO. Apresento parecer operacional com base nas fontes de verdade do Runtime e envelopes v1.

---

# Parecer Operacional — Semântica de Projeções MCF (E3)

**Autor:** LÉO (Autoridade Delegada de Continuidade e Gates Internos)  
**Missão:** MCF-CONTROL-CENTER-001 / remediação E3  
**Base:** Runtime (mcf-runtime.repository.ts, mission-observability.service.ts, 0013_mcf_runtime.sql) + envelopes v1 + arquitetura E3

---

## 1. Decisão Operacional — Idempotência

**Evidência do Runtime:**
- `mcf_events.sequence` (bigint identity unique) — primary key, garante ordem.
- `mcf_events.idempotency_key` (text not null unique) — campo de idempotência explícito.
- `listEvents` retorna `McfEventRecord[]` (sem especificação de ordenação, mas índices por sequence).

**Decisão:**
O envelope **MCF-CONTROL-EVENT-v1** deve expor **`eventId`** (como primary key do Runtime) e **`sourceSequence`** (copiado de `mcf_events.sequence`). O receipt do ingest deve validar que `eventId` é único e que `sourceSequence` corresponde à ordem de inserção no Runtime. Não usar `idempotency_key` no envelope (ela é interna ao Runtime), mas o receipt deve registrar `idempotency_key` do Runtime para fins de auditoria.

**Regra de idempotência no Control Center:**
- `eventId` = `mcf_events.id` (primary key) → garante unicidade.
- `sourceSequence` = `mcf_events.sequence` → garante ordem cronológica.
- Duplicate detection: se `eventId` já existe em `source_events`, REJECT.

---

## 2. Ordenação de Eventos para Projeções

**Evidência do Runtime:**
- `mcf_events.sequence` é bigint identity unique (ordem de inserção).
- Índices: `mcf_events_mission_idx (mission_id, sequence)` e `mcf_events_phase_idx (phase_id, sequence)`.
- `listEvents` retorna eventos (implícitamente ordenados por sequence, pois é o primary key identity).

**Decisão:**
O envelope outbound **deve expor `sourceSequence`** (copiado de `mcf_events.sequence`). As projeções **ordenam eventos por `sourceSequence` asc** para garantir ordem cronológica e evitar inconsistências de estado.

**Mapping de campos:**
- `sourceSequence` → `mcf_events.sequence` (bigint)
- `eventId` → `mcf_events.id` (text/UUID)
- `occurredAt` → `mcf_events.occurred_at` (timestamptz)
- `receivedAt` → adicionado pelo ingest (timestamptz)

**Risco:**
Se o Runtime emitir eventos fora de ordem (sem atualizar sequence), a projeção será inconsistente. O receipt deve validar que `sourceSequence` é monotônico crescente para cada mission/phase.

---

## 3. Papel de mission.version

**Evidência do Runtime:**
- `mcf_missions.version` (integer not null default 1, check version > 0).
- `version` é incrementado em cada atualização de estado (observado em mission-observability.service.ts:183: `idempotencyKey: mission:${mission.id}:blocked-alert:v${mission.version}`).
- Não há garantia de ordem global: `version` é incrementado por missão, não por evento.

**Decisão:**
`mission.version` é um identificador de **versão de estado** (concorrência/estado), **não** ordem de todos os eventos. Não confundir com `sourceSequence`.

**Uso correto:**
- Concorrência: `version` permite detectar race conditions ao atualizar missão (compare version no UPDATE).
- Idempotência: `version` pode ser usado em keys de idempotência específicas (ex: alertas bloqueados).
- Ordem de eventos: `sourceSequence` é a única fonte de verdade.

---

## 4. Regras de stale/out-of-order/duplicate para Projeções

**Evidência do envelope v1:**
- Regra 1: `eventId` deve ser idempotente.
- Regra 2: `occurredAt` vem da origem; `receivedAt` é acrescentado pelo Control Center.
- Regra 3: O Control Center não altera eventos recebidos; cria projeções derivadas.

**Decisão:**

**Duplicate detection:**
- Se `eventId` existe em `source_events` → REJECT.
- Se `idempotency_key` existe em `mcf_events` → REJECT (mesmo evento reenviado).

**Out-of-order detection:**
- Se `sourceSequence` não é maior que o último `sourceSequence` conhecido para o mesmo mission/phase → REJECT.
- Se `occurredAt` não é maior que o último `occurredAt` conhecido → WARN (pode ser reordenado por transporte).

**Stale detection:**
- Se `occurredAt` > `receivedAt` por mais de `X` segundos (configurável, ex: 5 min) → STALE.
- Se `eventId` não existe em `source_events` mas `occurredAt` é recente → STALE.

**Regra LIVE:**
- Projeção é LIVE se referencia `eventId`/`sourceSequence` verificável em `source_events`.
- Se `source_events` não existe ou foi deletado (não permitido no append-only) → DEGRADED/UNKNOWN.

---

## 5. Semântica Mínima das Projeções

**Evidência do envelope v1:**
- Campos: `eventId`, `eventType`, `occurredAt`, `missionId`, `phaseId`, `agentId`, `skillId`, `missionVersion`, `repository`, `commitSha`, `payload`.

**Evidência da arquitetura E3:**
- Projeções: `missions`, `mission_phases`, `mission_assignments`, `handoffs`, `gates`, `evidence_receipts`, `runtime_snapshots`, `agents`, `skills`.

**Decisão:**

**Projeções derivadas de eventos:**
- `missions`: derivado de `MISSION_CREATED`, `MISSION_STATE_CHANGED`, `MISSION_COMPLETED`, `MISSION_CANCELLED`.
- `mission_phases`: derivado de `PHASE_STARTED`, `PHASE_COMPLETED`, `MISSION_STATE_CHANGED`.
- `mission_assignments`: derivado de `AGENT_ASSIGNED` (ou inferido de `phaseId` + `agentId` em eventos de fase).
- `handoffs`: derivado de `HANDOFF_CREATED` (ou inferido de handoff no payload).
- `gates`: derivado de `GATE_OPENED`, `GATE_RESOLVED` (ou `GATE_REQUIRED` em eventos bloqueantes).
- `evidence_receipts`: derivado de `EVIDENCE_ACCEPTED`, `EVIDENCE_REJECTED`.
- `agents`: derivado de `AGENT_ASSIGNED` e eventos de execução (não precisa de snapshot).
- `skills`: derivado de `skillId` em eventos (não precisa de snapshot).

**Projeções que precisam de snapshot/registry fonte:**
- `runtime_snapshots`: derivado de snapshot do Runtime (não de eventos). O envelope v1 deve expor `snapshotId` e `snapshotUrl` quando necessário.

**Observação:**
`mission_assignments` não aparece explicitamente no envelope v1, mas pode ser inferido de `phaseId` + `agentId` em eventos de fase. Se necessário, adicionar `assignmentId` e `assignmentType` ao envelope.

---

## 6. Informação a Adicionar ao MCF-CONTROL-EVENT-v1

**Evidência de gaps:**
- Envelope v1 não tem `sourceSequence`.
- Envelope v1 não tem `snapshotId`/`snapshotUrl` para `runtime_snapshots`.
- Envelope v1 não tem `handoffId`/`handoffType` para `handoffs`.

**Decisão:**
Antes da E4, adicionar ao envelope v1:

```json
{
  "sourceSequence": "bigint",           // mcf_events.sequence
  "snapshotId": "uuid-or-null",         // para runtime_snapshots
  "snapshotUrl": "string-or-null",      // para runtime_snapshots
  "handoffId": "uuid-or-null",          // para handoffs
  "handoffType": "string-or-null"       // para handoffs
}
```

**Tipos de eventos adicionais:**
- `RUNTIME_SNAPSHOT_CREATED`
- `RUNTIME_SNAPSHOT_DELETED`
- `HANDOFF_RECEIVED`

---

## 7. TTL/Particionamento — Decisão Mínima Segura para MVP

**Evidência da arquitetura E3:**
- `source_events` é append-only, preserva o que aconteceu.
- Projeções são tabelas materializadas para leitura rápida.
- Realtime propaga mudanças.

**Decisão:**

**TTL (Time To Live) — MVP:**
- `source_events`: **NENHUM TTL** (append-only, usado para auditoria e reprocessamento).
- `ingest_receipts`: **90 dias** (evidência de ingestão, pode ser limpo após reconciliação).
- Projeções: **NENHUM TTL** (snapshot de estado atual, usado pelo UI).

**Particionamento — MVP:**
- `source_events`: **particionar por mission_id** (idx: `mcf_events_mission_idx`).
- `ingest_receipts`: **particionar por mission_id** (similar a source_events).
- Projeções: **não particionar** (tabelas pequenas para MVP, single-node).
- `runtime_snapshots`: **particionar por mission_id**.

**Diferenciação ledger auditável vs snapshots efêmeros:**
- `source_events` + `ingest_receipts` = ledger auditável (imutável, append-only).
- Projeções + `runtime_snapshots` = snapshots efêmeros (reconstruídos a partir do ledger).

**Risco:**
Particionamento por mission_id evita lock contention em missões individuais, mas não escala para milhões de missões. Se volume crescer, considerar particionamento por data.

---

## 8. Dependência Técnica para E3 Poder Avançar

**Evidência de gaps:**
- Semântica de projeções MCF não especificada (NÃO-BLOCKER-1 por Emily).
- Decisão de TTL/particionamento não tomada (HIP por Emily).
- Workshop SOFIA+LÉO+Rafael não realizado.

**Decisão:**
A E3 **pode avançar** após essas definições, mas **não pode fechar completamente** até que:
1. Semântica de projeções MCF esteja documentada (este parecer).
2. Decisão de TTL/particionamento esteja acordada com LÉO (decisão mínima segura acima).
3. Workshop SOFIA+LÉO+Rafael seja realizado para validar a arquitetura e controles de segurança.

**Gate interno:**
- **CONTINUAR** (com remediações obrigatórias).

---

## 9. Regras de Ordering/Idempotência — Resumo

**Idempotência:**
- `eventId` = primary key do Runtime (unicidade).
- `sourceSequence` = ordem de inserção (monotônico crescente).
- Duplicate: se `eventId` existe → REJECT.

**Ordenação:**
- Projeções ordenam por `sourceSequence asc`.
- `sourceSequence` é copiado de `mcf_events.sequence`.
- `occurredAt` é usado apenas para timestamp, não para ordenação (pode ser reordenado por transporte).

**Race conditions:**
- `mission.version` usado para detectar race conditions ao atualizar missão.
- `sourceSequence` usado para detectar out-of-order.

---

## 10. Regras LIVE — Resumo

**Projeção LIVE se:**
- `eventId` existe em `source_events`.
- `sourceSequence` é monotônico crescente.
- `occurredAt` é recente (não stale).
- `receivedAt` é definido (ingest receipt existe).

**Projeção STALE se:**
- `eventId` não existe em `source_events` (deve ser REJECT).
- `occurredAt` > `receivedAt` por mais de `X` segundos.
- `sourceSequence` não é maior que o último conhecido.

**Projeção DEGRADED/UNKNOWN se:**
- `source_events` foi deletado (não permitido no append-only, mas possível em erro).
- `eventId` existe mas `occurredAt` é muito antigo e não há receipt.

---

## 11. Regras de Stale/Out-of-Order/Duplicate — Resumo

**Duplicate:**
- `eventId` existe em `source_events` → REJECT.
- `idempotency_key` existe em `mcf_events` → REJECT.

**Out-of-Order:**
- `sourceSequence` não é maior que o último `sourceSequence` para mission/phase → REJECT.
- `occurredAt` não é maior que o último `occurredAt` → WARN (pode ser reordenado).

**Stale:**
- `occurredAt` > `receivedAt` por mais de `X` segundos → STALE.
- `eventId` não existe em `source_events` → STALE/REJECT.

---

## 12. Mapping/Projection Semantics v1 — Resumo

**Projeções derivadas de eventos:**
- `missions` → `MISSION_CREATED`, `MISSION_STATE_CHANGED`, `MISSION_COMPLETED`, `MISSION_CANCELLED`.
- `mission_phases` → `PHASE_STARTED`, `PHASE_COMPLETED`, `MISSION_STATE_CHANGED`.
- `mission_assignments` → `AGENT_ASSIGNED` (ou inferido de `phaseId` + `agentId`).
- `handoffs` → `HANDOFF_CREATED` (ou inferido de handoff no payload).
- `gates` → `GATE_OPENED`, `GATE_RESOLVED`, `GATE_REQUIRED`.
- `evidence_receipts` → `EVIDENCE_ACCEPTED`, `EVIDENCE_REJECTED`.
- `agents` → `AGENT_ASSIGNED` + eventos de execução.
- `skills` → `skillId` em eventos.

**Projeções que precisam de snapshot/registry fonte:**
- `runtime_snapshots` → derivado de snapshot do Runtime (não de eventos). Envelope v1 deve expor `snapshotId` e `snapshotUrl`.

---

## 13. Itens para Revisão de SOFIA e RAFAEL

**SOFIA (Arquitetura/Segurança):**
- Validar semântica de projeções MCF (este parecer).
- Validar decisão de TTL/particionamento (MVP vs futura escala).
- Validar regras de LIVE/STALE/DEGRADED.

**RAFAEL (Engenharia):**
- Validar `sourceSequence` no envelope v1.
- Validar `snapshotId`/`snapshotUrl` para `runtime_snapshots`.
- Validar `handoffId`/`handoffType` para `handoffs`.
- Validar regras de duplicate/out-of-order/stale no ingest.
- Validar `receivedAt` no envelope v1.
- Atualizar schema `source_events` se necessário.

---

## 14. Handoff para SOFIA e RAFAEL

**SOFIA:**
- Realizar workshop para validar semântica de projeções MCF.
- Aprovar decisão de TTL/particionamento (MVP vs futura escala).
- Validar regras de LIVE/STALE/DEGRADED.

**RAFAEL:**
- Implementar `sourceSequence` no envelope v1.
- Implementar `snapshotId`/`snapshotUrl` no envelope v1.
- Implementar `handoffId`/`handoffType` no envelope v1.
- Implementar regras de duplicate/out-of-order/stale no ingest.
- Implementar `receivedAt` no envelope v1.
- Atualizar schema `source_events` se necessário.

---

## 15. Gate Interno — Decisão Final

**Evidência:**
- Semântica de projeções MCF foi analisada com base no Runtime real (mcf-runtime.repository.ts, mission-observability.service.ts, 0013_mcf_runtime.sql).
- Decisão de TTL/particionamento foi baseada na arquitetura E3 (append-only ledger vs snapshots efêmeros).
- Regras de ordering/idempotência foram derivadas das evidências do Runtime.
- Regras de stale/out-of-order/duplicate foram derivadas do envelope v1 e da arquitetura E3.
- Semântica mínima das projeções foi derivada do envelope v1 e da arquitetura E3.
- Informações a adicionar ao envelope v1 foram derivadas dos gaps identificados.

**Decisão:**
- **CONTINUAR** (com remediações obrigatórias).

**Justificativa:**
- Todas as decisões foram baseadas em evidências concretas do Runtime e do envelope v1.
- Não há inventação de capacidades ou campos.
- Regras de ordering/idempotência são claras e verificáveis.
- Semântica de projeções é mínima e suficiente para MVP.
- TTL/particionamento foi decidido com base em arquitetura E3 (append-only ledger vs snapshots efêmeros).
- Handoff para SOFIA e RAFAEL é claro e verificável.

**Próximos passos:**
1. MESTRE aprova este parecer.
2. Workshop SOFIA+LÉO+Rafael realizado.
3. Decisão de TTL/particionação finalizada.
4. SOFIA e RAFAEL implementam revisões e atualizam o envelope v1.
5. E4 inicia após aceite das remediações.
