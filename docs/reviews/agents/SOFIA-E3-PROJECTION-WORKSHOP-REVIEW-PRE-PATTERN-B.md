Agora iniciarei a revisão crítica completa. Consolidei todas as fontes de verdade necessárias.

---

# PARECER ARQUITETURAL — SOFIA
**Missão:** MCF-CONTROL-CENTER-001 / Remediação E3 — Projection Semantics  
**Data:** 2026-09-02  
**Autoridade:** Arquitetura de Software (contrato canônico `agents/SOFIA.md`)

---

## SUMÁRIO EXECUTIVO

Após análise das fontes de verdade do Runtime real (`0013_mcf_runtime.sql`, `mcf-runtime.repository.ts`, `mission-observability.service.ts`, `contracts-mcf-runtime.ts`) e confronto com o parecer de LÉO (`LEO-E3-PROJECTION-SEMANTICS.md`), identifico **ERROS CRÍTICOS DE INTERPRETAÇÃO** que inviabilizam implementação direta.

**Veredito:** **APROVAR COM CORREÇÕES OBRIGATÓRIAS**

---

## 1. ERRO CRÍTICO — PRIMARY KEY vs SEQUENCE

### Evidência do Runtime (0013_mcf_runtime.sql, linhas 80-90)

```sql
create table if not exists "mcf_events" (
  "id" text primary key,
  "sequence" bigint generated always as identity unique,
  ...
)
```

### Afirmação INCORRETA de LÉO (seção 1, linha 16-17)

> "Evidência do Runtime:
> - `mcf_events.sequence` (bigint identity unique) — **primary key**, garante ordem."

### CORREÇÃO ARQUITETURAL

- **`mcf_events.id`** (text) é a PRIMARY KEY.
- **`mcf_events.sequence`** (bigint generated always as identity unique) é UNIQUE NOT NULL, mas NÃO é PK.
- `sequence` é identity monotônico crescente, ideal para ordenação.
- `id` é texto/UUID, ideal para idempotência e referências externas.

### Decisão Arquitetural

**ACEITO** o conceito de LÉO de expor `sourceSequence` no envelope, MAS **REJEITO** a confusão entre PK e sequence. O envelope v1 deve conter:

```json
{
  "eventId": "uuid",           // mcf_events.id (PK)
  "sourceSequence": 12345      // mcf_events.sequence (ordering)
}
```

**Idempotência:** `eventId` (PK).  
**Ordenação:** `sourceSequence` (identity).

---

## 2. LISTEVENTS — ORDERING NÃO ESPECIFICADA

### Evidência do Runtime (mcf-runtime.repository.ts, linha 132)

```typescript
listEvents(missionId: string): Promise<McfEventRecord[]>;
```

### Afirmação NÃO FUNDAMENTADA de LÉO (seção 2, linha 35-36)

> "`listEvents` retorna eventos (implícitamente ordenados por sequence, pois é o primary key identity)."

### CORREÇÃO ARQUITETURAL

- A interface TypeScript **NÃO especifica ordem**.
- O SQL schema possui índice `mcf_events_mission_idx (mission_id, sequence)`, sugerindo ordenação por sequence, mas **não garantindo** sem cláusula `ORDER BY` explícita.
- A implementação real pode ou não ordenar; sem acesso ao código da implementação, **NÃO PODEMOS ASSUMIR**.

### Decisão Arquitetural

**REJEITO** a suposição de ordenação implícita. O Runtime **DEVE** garantir `ORDER BY sequence ASC` em `listEvents`, ou o Control Center **DEVE** ordenar localmente após receber eventos.

**Recomendação para E4:** Rafael deve verificar a implementação de `listEvents` e garantir ordenação explícita por `sequence ASC`.

---

## 3. MISSION.VERSION — USO CORRETO

### Evidência do Runtime (0013_mcf_runtime.sql, linha 17; mission-observability.service.ts, linha 183)

```sql
"version" integer not null default 1 check ("version" > 0)
```

```typescript
idempotencyKey: `mission:${mission.id}:blocked-alert:v${mission.version}`
```

### Avaliação do Parecer de LÉO (seção 3)

**CORRETO.** LÉO identificou corretamente que:

- `mission.version` é **versão de estado** (concorrência otimista), não ordem de eventos.
- `sourceSequence` é a única fonte de ordem cronológica.
- `version` é usado para detectar race conditions em updates e compor chaves de idempotência.

**ACEITO SEM RESSALVAS.**

---

## 4. OUT-OF-ORDER / STALE / DUPLICATE — ESTRATÉGIA REJECT É ARRISCADA

### Proposta de LÉO (seção 4, linhas 80-83)

> "**Out-of-order detection:**
> - Se `sourceSequence` não é maior que o último `sourceSequence` conhecido para o mesmo mission/phase → **REJECT**."

### ANÁLISE ARQUITETURAL — RISCO DE PERDA DE HISTÓRIA

**Cenário:**

1. Runtime emite eventos sequence 10, 11, 12.
2. Transporte entrega 10, 12 (11 atrasado).
3. Control Center recebe 10 (OK), depois 12 (OK, `sourceSequence` > último).
4. Control Center recebe 11 (atrasado): `sourceSequence` (11) NÃO é maior que último conhecido (12) → **REJECT**.
5. **Evento 11 PERDIDO permanentemente.**

### CORREÇÃO ARQUITETURAL

Ledger auditável **NÃO PODE PERDER EVIDÊNCIA**. Evento válido que chega fora de ordem deve ser:

**Opção A (MVP recomendado):** ACCEPT com flag `out_of_order: true`, persistir em `source_events`, marcar projeções como `RECONCILIATION_PENDING`, processar reconciliação assíncrona.

**Opção B (alternativa):** REJECT no ingest, mas **persistir em tabela de quarentena** (`rejected_events`) com razão `OUT_OF_ORDER_SEQUENCE`, permitir reconciliação manual/automática posterior.

**Opção C (não recomendado para MVP):** Implementar janela de reordenação (buffer de N eventos), processar em lote ordenado. Aumenta latência.

### Decisão Arquitetural

**REJEITO** a estratégia REJECT simples de LÉO para out-of-order.

**DECISÃO:** Implementar **Opção A** para MVP:

```typescript
interface SourceEvent {
  eventId: string;            // PK
  sourceSequence: bigint;
  missionId: string;
  receivedAt: timestamptz;
  occurredAt: timestamptz;
  rawBody: jsonb;
  signatureStatus: 'VALID' | 'INVALID' | 'PENDING';
  processingStatus: 'ACCEPTED' | 'OUT_OF_ORDER' | 'DUPLICATE' | 'INVALID';
  reconciliationStatus: 'PENDING' | 'RECONCILED' | 'NOT_APPLICABLE';
}
```

**Regra de ingest:**

1. Se `eventId` existe → REJECT como `DUPLICATE` (preservar idempotência).
2. Se `sourceSequence` fora de ordem → ACCEPT com `processingStatus: 'OUT_OF_ORDER'`, `reconciliationStatus: 'PENDING'`.
3. Job assíncrono detecta gaps de sequence, reordena e atualiza projeções.
4. Projeções marcam missão como `RECONCILIATION_PENDING` até job completar.

**NÃO perca evidência auditável.**

---

## 5. RECEIVEDAT — ENVELOPE vs INGEST

### Proposta de LÉO (seção 6, linha 134; seção 14, linha 295)

> "Antes da E4, adicionar ao envelope v1:
> - (lista não inclui `receivedAt`)"
> 
> "Implementar `receivedAt` no envelope v1."

### Evidência do Envelope Atual (MCF-CONTROL-EVENT-v1.md, linha 46)

> "Regras: `occurredAt` vem da origem; **`receivedAt` é acrescentado pelo Control Center**."

### ANÁLISE ARQUITETURAL

**CONTRADIÇÃO:** LÉO propõe adicionar `receivedAt` ao envelope outbound do Runtime, mas o contrato atual afirma que `receivedAt` é **criado pelo receptor** (Control Center).

**Clock skew:** Se Runtime adicionar `receivedAt` antes de enviar, o timestamp reflete o clock do Runtime, não do Control Center. Análise de latência/atraso torna-se imprecisa.

### Decisão Arquitetural

**REJEITO** adicionar `receivedAt` ao envelope outbound.

**DECISÃO:** Manter regra atual:

- Envelope outbound contém **SOMENTE `occurredAt`** (timestamp de origem).
- Control Center adiciona **`receivedAt`** no momento de ingest (clock local do receptor).
- Diferença `receivedAt - occurredAt` mede latência + clock skew.

**Se clock skew for crítico:** Runtime pode adicionar `sentAt` (opcional), permitindo análise de latência de transporte:

```
Latência de rede = receivedAt - sentAt
Clock skew estimado = occurredAt - sentAt
```

---

## 6. RUNTIME_SNAPSHOTS — SNAPSHOTID/URL NÃO SUPORTADO

### Proposta de LÉO (seção 5, linhas 115-116; seção 6, linhas 136-138)

> "Projeções que precisam de snapshot/registry fonte:
> - `runtime_snapshots`: derivado de snapshot do Runtime (não de eventos). O envelope v1 deve expor `snapshotId` e `snapshotUrl` quando necessário."
> 
> "Antes da E4, adicionar ao envelope v1:
> ```json
> {
>   "snapshotId": "uuid-or-null",
>   "snapshotUrl": "string-or-null"
> }
> ```"

### Evidência do Runtime

**NÃO EXISTE** referência a `snapshotId`, `snapshotUrl` ou mecanismo de snapshot em:

- `0013_mcf_runtime.sql` (schema completo)
- `mcf-runtime.repository.ts` (interface completa)
- `mission-observability.service.ts` (serviço de observabilidade)
- `contracts-mcf-runtime.ts` (contratos de eventos)

### Evidência da Arquitetura E3

`E3-CONTROL-CENTER-ARCHITECTURE.md` lista projeção `runtime_snapshots` (linha 61), mas **NÃO especifica fonte**.

### ANÁLISE ARQUITETURAL — INVENÇÃO DE CAPACIDADE

LÉO **INVENTOU** campos `snapshotId`/`snapshotUrl` sem evidência no Runtime real. O Runtime **NÃO possui** mecanismo de snapshot observável.

**Alternativa existente:** `MissionObservabilityService` (mission-observability.service.ts) expõe:

- `getMissionObservation(missionId)` → snapshot de estado atual.
- `listBlockedMissions()` → snapshot de missões bloqueadas.

### Decisão Arquitetural

**REJEITO** adicionar `snapshotId`/`snapshotUrl` ao envelope v1 sem evidência de suporte no Runtime.

**DECISÃO:** Projeção `runtime_snapshots` no Control Center deve ser **derivada de polling/push** do `MissionObservabilityService`, não de eventos. Duas estratégias:

**Opção A (recomendado):** Control Center faz polling periódico de `/missions/{id}/observation` e persiste snapshot como evento sintético local (não enviado pelo Runtime).

**Opção B:** Runtime adiciona evento `RUNTIME_SNAPSHOT_CAPTURED` com payload contendo snapshot completo. Requer alteração no Runtime (fora de escopo E3).

**Para MVP E4:** Implementar **Opção A** (polling). Avaliar Opção B em E5+ se necessário.

---

## 7. MCFEVENTTYPE — COMPATIBILIDADE

### Proposta de LÉO (seção 6, linhas 143-146)

> "Tipos de eventos adicionais:
> - `RUNTIME_SNAPSHOT_CREATED`
> - `RUNTIME_SNAPSHOT_DELETED`
> - `HANDOFF_RECEIVED`"

### Evidência do Runtime (contracts-mcf-runtime.ts, linhas 267-297)

```typescript
export type McfEventType =
  | 'MISSION_CREATED'
  | 'MISSION_STATE_CHANGED'
  | 'SUBMISSION_OPENED'
  | 'PARENT_RETURN_COMPLETED'
  | 'PARENT_RETURN_DEFERRED'
  | 'PARENT_MISSION_RESUMED'
  | 'PHASE_STARTED'
  | 'SKILL_SELECTED'
  | 'PERMISSION_GRANTED'
  | 'PERMISSION_DENIED'
  | 'TOOL_REQUESTED'
  | 'TOOL_RECEIPT_RECORDED'
  | 'EVIDENCE_VALIDATED'
  | 'EVIDENCE_REJECTED'
  | 'EXTERNAL_ACTION_REQUESTED'
  | 'EXTERNAL_ACTION_ALLOWED'
  | 'EXTERNAL_ACTION_EXECUTED'
  | 'EXTERNAL_ACTION_FAILED'
  | 'EXTERNAL_ACTION_EVIDENCE_VALIDATED'
  | 'EXTERNAL_ACTION_ABANDONED'
  | 'HANDOFF_CREATED'
  | 'RECOVERY_STARTED'
  | 'RECOVERY_COMPLETED'
  | 'GATE_REQUIRED'
  | 'GATE_APPROVED'
  | 'GATE_REJECTED'
  | 'PHASE_COMPLETED'
  | 'MISSION_COMPLETED'
  | 'MISSION_BLOCKED_ALERT_RAISED'
  | 'CI_CALLBACK_RECEIVED';
```

### Tipos Propostos no Envelope Inicial (MCF-CONTROL-EVENT-v1.md, linhas 28-42)

```
- MISSION_CREATED
- MISSION_STATE_CHANGED
- PHASE_STARTED
- PHASE_COMPLETED
- AGENT_ASSIGNED              ← NÃO EXISTE no Runtime
- HANDOFF_CREATED
- GATE_OPENED                 ← NÃO EXISTE no Runtime (Runtime usa GATE_REQUIRED)
- GATE_RESOLVED               ← NÃO EXISTE no Runtime (Runtime usa GATE_APPROVED/REJECTED)
- EVIDENCE_ACCEPTED           ← NÃO EXISTE no Runtime (Runtime usa EVIDENCE_VALIDATED)
- EVIDENCE_REJECTED
- MISSION_COMPLETED
- RUNTIME_HEALTH_CHANGED      ← NÃO EXISTE no Runtime
```

### ANÁLISE ARQUITETURAL — INCOMPATIBILIDADE

**Problemas:**

1. Envelope v1 propõe tipos **QUE NÃO EXISTEM** no Runtime.
2. LÉO propõe tipos **ADICIONAIS QUE NÃO EXISTEM** no Runtime.
3. Runtime possui **28 tipos** reais; envelope inicial lista **12 tipos** (6 incompatíveis).

### Decisão Arquitetural

**DECISÃO:** Alinhar envelope v1 com `McfEventType` real do Runtime.

**Estratégia de compatibilidade:**

**Fase 1 (MVP E4):** Envelope aceita **TODOS os 28 tipos** do Runtime. Projeções implementam mapeamento:

```typescript
// Mapeamento de tipos do Runtime → projeções
const PROJECTION_MAPPINGS = {
  missions: [
    'MISSION_CREATED',
    'MISSION_STATE_CHANGED',
    'MISSION_COMPLETED',
    'PARENT_RETURN_COMPLETED',
    'PARENT_RETURN_DEFERRED',
    'PARENT_MISSION_RESUMED',
  ],
  
  mission_phases: [
    'PHASE_STARTED',
    'PHASE_COMPLETED',
    'SKILL_SELECTED',
  ],
  
  gates: [
    'GATE_REQUIRED',       // Não "GATE_OPENED"
    'GATE_APPROVED',       // Não "GATE_RESOLVED"
    'GATE_REJECTED',
  ],
  
  evidence_receipts: [
    'EVIDENCE_VALIDATED',  // Não "EVIDENCE_ACCEPTED"
    'EVIDENCE_REJECTED',
    'EXTERNAL_ACTION_EVIDENCE_VALIDATED',
    'TOOL_RECEIPT_RECORDED',
  ],
  
  handoffs: [
    'HANDOFF_CREATED',
  ],
  
  // ... outros
};
```

**Fase 2 (E5+):** Avaliar se Runtime deve adicionar tipos faltantes ou se Control Center mantém mapeamento permanente.

**NÃO inventar eventos que não existem.**

---

## 8. AGENTS / SKILLS — PROJEÇÃO vs REGISTRY

### Proposta de LÉO (seção 5, linhas 112-113)

> "- `agents`: derivado de `AGENT_ASSIGNED` e eventos de execução (não precisa de snapshot).
> - `skills`: derivado de `skillId` em eventos (não precisa de snapshot)."

### Evidência do Runtime

**NÃO EXISTE** evento `AGENT_ASSIGNED` no `McfEventType`.

**Campos relacionados a agentes/skills nos eventos:**

- `McfEventRecord.agentId` (string | null)
- `McfEventRecord.phaseId` → `McfPhaseRecord.agentId` + `McfPhaseRecord.skillId`
- `McfMissionContract.selectedAgents` (string[])
- `McfMissionContract.selectedSkills` (string[])

### ANÁLISE ARQUITETURAL

**Agents:** Lista de agentes disponíveis é **registry estático** (parte do MCF Framework), não derivado de eventos operacionais. Eventos contêm `agentId` referenciando registry.

**Skills:** Definições de skills (`McfSkillDefinition`, contracts-mcf-runtime.ts linhas 315-331) são **registry estático**. Eventos contêm `skillId` referenciando registry.

### Decisão Arquitetural

**DECISÃO:** Projeções `agents` e `skills` são **snapshot de registry**, não derivadas de eventos.

**Fonte de verdade:**

- **Agents:** `docs/agentes/*.md` (definições canônicas).
- **Skills:** `skills/registry.yaml` ou equivalente (registro canônico).

**Estratégia de sincronização:**

**Opção A (MVP E4):** Control Center mantém cópia estática de agents/skills, atualizada manualmente quando registry mudar.

**Opção B (E5+):** Runtime expõe endpoint `/registry/agents` e `/registry/skills`; Control Center faz polling ou recebe webhook de mudança.

**Para MVP:** Implementar **Opção A**.

---

## 9. TTL / PARTICIONAMENTO — DECISÃO MÍNIMA SEGURA

### Proposta de LÉO (seção 7)

> "TTL (Time To Live) — MVP:
> - `source_events`: **NENHUM TTL**
> - `ingest_receipts`: **90 dias**
> - Projeções: **NENHUM TTL**
> 
> Particionamento — MVP:
> - `source_events`: **particionar por mission_id**"

### ANÁLISE ARQUITETURAL

**TTL:**

**ACEITO** a decisão de nenhum TTL para `source_events` (ledger auditável não pode perder evidência).

**REJEITO** TTL de 90 dias para `ingest_receipts` sem justificativa técnica. Receipts são **evidência de ingest**; se `source_events` é permanente, receipts também devem ser (rastreabilidade completa).

**Projeções:** ACEITO nenhum TTL (state atual).

**Particionamento:**

**ACEITO** particionamento por `mission_id` para `source_events` como baseline MVP.

**ATENÇÃO:** Particionamento por `mission_id` funciona bem para consultas por missão, mas **NÃO** escala para consultas globais (ex: "todos os eventos de GATE_REJECTED nas últimas 24h"). Se análise cross-mission for requisito, adicionar particionamento por **data** (ex: `PARTITION BY RANGE (occurred_at)`).

### Decisão Arquitetural

**DECISÃO TTL:**

- `source_events`: **SEM TTL** (permanente).
- `ingest_receipts`: **SEM TTL** (permanente, rastreabilidade).
- Projeções: **SEM TTL** (state atual).

**DECISÃO Particionamento MVP:**

- `source_events`: Particionar por `mission_id` (baseline) + **índice composto** `(occurred_at, mission_id)` para queries temporais.
- Avaliar particionamento por data em E5+ se volume crescer além de 10M eventos.

---

## 10. LIVE / STALE / DEGRADED — SEMÂNTICA PRECISA

### Proposta de LÉO (seção 4, linha 85-92)

> "Stale detection:
> - Se `occurredAt` > `receivedAt` por mais de `X` segundos (configurável, ex: 5 min) → STALE."

### ANÁLISE ARQUITETURAL — LÓGICA INVERTIDA

**ERRO:** `occurredAt` **NUNCA** pode ser maior que `receivedAt` (evento não pode ser recebido antes de ocorrer, assumindo clocks sincronizados).

**Cenário real:**

- `occurredAt`: 2026-09-02T21:00:00Z (Runtime clock)
- `receivedAt`: 2026-09-02T21:05:00Z (Control Center clock)
- **Diferença:** `receivedAt - occurredAt` = 5 min (latência + clock skew)

### Decisão Arquitetural — Semântica LIVE/STALE/DEGRADED

**LIVE:**

- Evento existe em `source_events`.
- `signatureStatus == 'VALID'`.
- `processingStatus == 'ACCEPTED'`.
- `receivedAt - occurredAt` < THRESHOLD (ex: 5 min).
- Projeção atualizada com base neste evento.

**STALE:**

- Evento existe em `source_events`.
- `signatureStatus == 'VALID'`.
- `processingStatus == 'ACCEPTED'`.
- **`receivedAt - occurredAt` > THRESHOLD** (latência excessiva, possível replay ou clock skew).
- Projeção pode estar desatualizada.

**DEGRADED:**

- Evento existe mas `signatureStatus == 'INVALID'` ou `processingStatus == 'OUT_OF_ORDER'`.
- Projeção marcada como pendente de reconciliação.

**UNKNOWN:**

- Projeção referencia `eventId` que **não existe** em `source_events` (erro de integridade).
- UI deve alertar e requerer investigação.

### Decisão de Threshold

**NÃO** definir limiar arbitrário (5 min) sem medição. Para MVP:

**DECISÃO:** `STALE_THRESHOLD_SECONDS = 300` (5 min) como baseline configurável. Rafael deve instrumentar latência real na E4 e ajustar threshold com base em P95/P99 observado.

---

## 11. ENVELOPE OUTBOUND — CAMPOS TOP-LEVEL vs PAYLOAD

### Campos Atuais no Envelope v1

```json
{
  "schema": "mcf_control_event/v1",
  "eventId": "uuid-or-stable-id",
  "eventType": "MISSION_STARTED",
  "source": "mcf-runtime",
  "occurredAt": "2026-09-02T18:00:00.000Z",
  "missionId": "uuid",
  "phaseId": "uuid-or-null",
  "agentId": "Mestre-or-null",
  "skillId": "MCF-START-MISSION-or-null",
  "repository": "leon337/multiagent-collaboration-framework",
  "commitSha": "40-char-sha-or-null",
  "missionVersion": 3,
  "evidenceRef": "receipt-id-or-null",
  "payload": {}
}
```

### Decisão Arquitetural — Estrutura Final

**CAMPOS TOP-LEVEL (envelope):**

- `schema`: "mcf_control_event/v1"
- `eventId`: string (mcf_events.id, PK)
- **`sourceSequence`**: bigint (mcf_events.sequence, ordering) — **ADICIONAR**
- `eventType`: McfEventType (um dos 28 tipos reais)
- `source`: "mcf-runtime"
- `occurredAt`: ISO 8601 timestamp (mcf_events.occurred_at)
- `missionId`: string
- `phaseId`: string | null
- `agentId`: string | null

**CAMPOS PAYLOAD (event-specific):**

- `skillId`: mover para payload (não é universal)
- `repository`: mover para payload (específico de alguns eventos)
- `commitSha`: mover para payload (específico de alguns eventos)
- `missionVersion`: manter top-level? Ou mover para payload? **DECISÃO:** Mover para payload (não é universal, específico de MISSION_STATE_CHANGED).
- `evidenceRef`: mover para payload (específico de eventos de evidência)
- `payload`: dados específicos do eventType

**Justificativa:**

- Top-level contém **campos universais** (todo evento possui).
- Payload contém **campos específicos** (apenas alguns eventos possuem).
- Reduz ruído e facilita parsing consistente.

---

## 12. RATE LIMITING / RLS — CLASSIFICAÇÃO

### Evidência da Auditoria de Emily (EMILY-E3-INDEPENDENT-AUDIT.md)

```
| Rate limiting | OBRIGATÓRIO E4 | Prevenção de DoS | Requisito crítico |
| RLS em tabelas sensíveis | OBRIGATÓRIO E4 | Controle de acesso | Requisito crítico |
```

### Análise Arquitetural

**Rate Limiting:** Requisito operacional de **infraestrutura** (não altera arquitetura de dados ou contratos). Implementação específica (ex: 100 req/min) é **configuração**, não decisão arquitetural.

**RLS (Row Level Security):** Requisito de **segurança** que afeta schema de permissões e design de queries. Decisão arquitetural: quais tabelas, quais políticas, baseado em que campos (mission_id, user_id).

### Decisão Arquitetural

**RECLASSIFICO:**

- **Rate Limiting:** Requisito de infraestrutura/operacional (não bloqueante arquiteturalmente). Valor numérico definido por Rafael/Ricardo com base em medição.

- **RLS:** Requisito arquitetural (bloqueante E4). Decisão necessária:
  - Quais tabelas: `source_events`, `missions`, `mission_phases`, `handoffs`, `gates`, `evidence_receipts`.
  - Política base: `WHERE mission_id IN (SELECT mission_id FROM user_mission_access WHERE user_id = current_user_id())`.
  - Exceção: `LEANDRO` tem acesso irrestrito.

**Para E4:** Rafael deve implementar RLS segundo política definida acima. Rate limiting implementado com valor inicial conservador (ex: 60 req/min), ajustado após medição.

---

## 13. ALTERAÇÕES EXATAS RECOMENDADAS

### 13.1. MCF-CONTROL-EVENT-v1.md

**Adicionar campos:**

```diff
{
  "schema": "mcf_control_event/v1",
  "eventId": "uuid",
+ "sourceSequence": 12345,
  "eventType": "MISSION_CREATED",
  "source": "mcf-runtime",
  "occurredAt": "2026-09-02T18:00:00.000Z",
  "missionId": "uuid",
  "phaseId": "uuid-or-null",
  "agentId": "agent-id-or-null",
- "skillId": "MCF-START-MISSION-or-null",
- "repository": "leon337/multiagent-collaboration-framework",
- "commitSha": "40-char-sha-or-null",
- "missionVersion": 3,
- "evidenceRef": "receipt-id-or-null",
  "payload": {}
}
```

**Atualizar seção "Tipos":**

```markdown
## Tipos Suportados

O envelope aceita todos os tipos definidos em `McfEventType` do Runtime:

- MISSION_CREATED
- MISSION_STATE_CHANGED
- SUBMISSION_OPENED
- PARENT_RETURN_COMPLETED
- PARENT_RETURN_DEFERRED
- PARENT_MISSION_RESUMED
- PHASE_STARTED
- SKILL_SELECTED
- PERMISSION_GRANTED
- PERMISSION_DENIED
- TOOL_REQUESTED
- TOOL_RECEIPT_RECORDED
- EVIDENCE_VALIDATED
- EVIDENCE_REJECTED
- EXTERNAL_ACTION_REQUESTED
- EXTERNAL_ACTION_ALLOWED
- EXTERNAL_ACTION_EXECUTED
- EXTERNAL_ACTION_FAILED
- EXTERNAL_ACTION_EVIDENCE_VALIDATED
- EXTERNAL_ACTION_ABANDONED
- HANDOFF_CREATED
- RECOVERY_STARTED
- RECOVERY_COMPLETED
- GATE_REQUIRED
- GATE_APPROVED
- GATE_REJECTED
- PHASE_COMPLETED
- MISSION_COMPLETED
- MISSION_BLOCKED_ALERT_RAISED
- CI_CALLBACK_RECEIVED

Campos `skillId`, `repository`, `commitSha`, `missionVersion`, `evidenceRef` ficam no payload conforme relevância do eventType.
```

**Adicionar regra de ordering:**

```markdown
## Regra de Ordenação

Eventos devem ser processados em ordem de `sourceSequence` ascendente. Eventos recebidos fora de ordem são aceitos mas marcados para reconciliação.
```

### 13.2. E3-CONTROL-CENTER-ARCHITECTURE.md

**Atualizar schema de `source_events`:**

```markdown
### Ledger

- `source_events`
  - `event_id` (text, PK)
  - `source_sequence` (bigint, unique, ordering)
  - `mission_id` (text, foreign key)
  - `event_type` (text, um dos McfEventType)
  - `occurred_at` (timestamptz)
  - `received_at` (timestamptz, criado no ingest)
  - `raw_body` (jsonb, envelope completo)
  - `signature_status` ('VALID' | 'INVALID' | 'PENDING')
  - `processing_status` ('ACCEPTED' | 'OUT_OF_ORDER' | 'DUPLICATE' | 'INVALID')
  - `reconciliation_status` ('PENDING' | 'RECONCILED' | 'NOT_APPLICABLE')

- `ingest_receipts`
  - `receipt_id` (uuid, PK)
  - `event_id` (text, foreign key)
  - `received_at` (timestamptz)
  - `validation_result` (jsonb)
  - `processing_duration_ms` (integer)
```

**Atualizar seção de projeções:**

```markdown
### MCF projections

- `missions` — derivado de MISSION_CREATED, MISSION_STATE_CHANGED, etc.
- `mission_phases` — derivado de PHASE_STARTED, PHASE_COMPLETED, SKILL_SELECTED
- `mission_assignments` — inferido de phaseId + agentId em eventos
- `handoffs` — derivado de HANDOFF_CREATED
- `gates` — derivado de GATE_REQUIRED, GATE_APPROVED, GATE_REJECTED
- `evidence_receipts` — derivado de EVIDENCE_VALIDATED, EVIDENCE_REJECTED, TOOL_RECEIPT_RECORDED
- `agents` — **snapshot de registry**, não derivado de eventos
- `skills` — **snapshot de registry**, não derivado de eventos
- `runtime_snapshots` — **polling de MissionObservabilityService**, não derivado de eventos
```

**Adicionar seção LIVE/STALE/DEGRADED:**

```markdown
## Regra LIVE/STALE/DEGRADED

### LIVE
- Evento verificável em `source_events`
- `signatureStatus == 'VALID'`
- `processingStatus == 'ACCEPTED'`
- `receivedAt - occurredAt < STALE_THRESHOLD_SECONDS` (default: 300s)

### STALE
- Evento válido mas latência excessiva (`receivedAt - occurredAt > threshold`)
- Projeção pode estar desatualizada

### DEGRADED
- `signatureStatus == 'INVALID'` ou `processingStatus == 'OUT_OF_ORDER'`
- Reconciliação pendente

### UNKNOWN
- Projeção referencia evento que não existe em `source_events`
- Erro de integridade, requer investigação
```

---

## 14. ITENS PARA RAFAEL VALIDAR NA ENGENHARIA

1. **`listEvents` ordering:** Verificar implementação real de `McfRuntimeRepository.listEvents()` e garantir `ORDER BY sequence ASC` explícito.

2. **Out-of-order handling:** Implementar lógica de accept + reconciliação (não reject simples).

3. **Envelope fields:** Adicionar `sourceSequence` ao código de emissão de eventos do Runtime.

4. **Event type mapping:** Criar tabela de mapeamento `McfEventType` → projeções.

5. **Stale threshold:** Instrumentar latência `receivedAt - occurredAt` e ajustar threshold com base em P95/P99.

6. **RLS policies:** Implementar Row Level Security em tabelas sensíveis.

7. **Agent/Skill registry:** Definir fonte canônica e estratégia de sincronização.

8. **Runtime snapshots:** Implementar polling de `MissionObservabilityService` para projeção.

9. **Reconciliation job:** Implementar job assíncrono para detectar gaps de sequence e reordenar.

10. **Signature verification:** Garantir verificação de assinatura antes de aceitar evento.

---

## 15. VEREDITO E HANDOFF

### Veredito

**APROVAR COM CORREÇÕES OBRIGATÓRIAS**

### Correções Obrigatórias Antes de E4

1. ✅ **Corrigir erro PRIMARY KEY vs SEQUENCE** — `id` é PK, `sequence` é ordering.
2. ✅ **Adicionar `sourceSequence` ao envelope v1.**
3. ✅ **Remover `receivedAt` do envelope outbound** (criado pelo receptor).
4. ✅ **Remover `snapshotId`/`snapshotUrl` inventados** (sem suporte no Runtime).
5. ✅ **Alinhar tipos de eventos** com `McfEventType` real (28 tipos).
6. ✅ **Mover campos específicos** (`skillId`, `repository`, `commitSha`, `missionVersion`) para payload.
7. ✅ **Definir estratégia de out-of-order** (accept + reconciliação, não reject).
8. ✅ **Corrigir semântica STALE** (`receivedAt - occurredAt`, não o inverso).
9. ✅ **Definir agents/skills como registry**, não projeção de eventos.
10. ✅ **TTL permanente para ledger** (`source_events` + `ingest_receipts`).

### Aprovações

| Item | Status | Fundamento |
|------|--------|------------|
| Conceito de `sourceSequence` | ✅ APROVADO | Essencial para ordering |
| `mission.version` como concorrência | ✅ APROVADO | Uso correto identificado |
| TTL permanente para ledger | ✅ APROVADO | Auditabilidade |
| Particionamento por `mission_id` | ✅ APROVADO | Baseline MVP |
| Semântica de projeções | ✅ APROVADO COM CORREÇÕES | Após corrigir tipos |

### Rejeições

| Item | Status | Razão |
|------|--------|-------|
| `sequence` como PRIMARY KEY | ❌ REJEITADO | `id` é PK, sequence é ordering |
| Ordenação implícita de `listEvents` | ❌ REJEITADO | Não especificada no contrato |
| Out-of-order → REJECT | ❌ REJEITADO | Perde evidência auditável |
| `receivedAt` no envelope outbound | ❌ REJEITADO | Clock do receptor, não origem |
| `snapshotId`/`snapshotUrl` | ❌ REJEITADO | Inventado, sem suporte no Runtime |
| Tipos de eventos inventados | ❌ REJEITADO | Usar `McfEventType` real (28 tipos) |
| TTL 90 dias para receipts | ❌ REJEITADO | Compromete rastreabilidade |

---

### Handoff para RAFAEL

**Prioridade CRÍTICA:**

1. Implementar correções obrigatórias 1-10 acima.
2. Atualizar `MCF-CONTROL-EVENT-v1.md` conforme seção 13.1.
3. Atualizar `E3-CONTROL-CENTER-ARCHITECTURE.md` conforme seção 13.2.
4. Validar itens de engenharia listados na seção 14.
5. Implementar schema de `source_events` com campos de reconciliação.

**Prioridade ALTA:**

6. Implementar RLS policies.
7. Instrumentar latência de ingest.
8. Implementar job de reconciliação.

---

### Handoff para MESTRE

**Estado:** E3 remediação concluída com correções arquiteturais críticas identificadas.

**Próximos passos:**

1. **MESTRE aprova este parecer** e correções obrigatórias.
2. **RAFAEL implementa correções 1-10** e atualiza contratos.
3. **Workshop SOFIA+RAFAEL+RICARDO** para validar implementação de segurança (RLS, assinaturas, out-of-order handling).
4. **Gate E3 → E4** após aceite de correções e contratos atualizados.

**Risco residual:** BAIXO após correções. Arquitetura é estruturalmente sólida; erros identificados são de interpretação/especificação, não de design fundamental.

---

**FIM DO PARECER ARQUITETURAL**

---

**Assinatura:** SOFIA  
**Data:** 2026-09-02T21:29:00Z  
**Sessão:** [gerada pelo sistema]
