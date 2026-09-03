# RAFAEL — Parecer de Engenharia / Fechamento E3 (Pattern B, Revisão Read-only)

Base: `input/00-MISSION.md`, `input/10-BASELINE.md`, `input/20-HANDOFF.md` e fontes sob `input/sources/`. Tratei `LEO-E3-PROJECTION-SEMANTICS.md` e `SOFIA-E3-PROJECTION-WORKSHOP-REVIEW.md` como **opiniões**, não como fatos; todas as provas vêm de `MCF-RUNTIME-0013.sql`, `postgres-mcf-runtime.repository.ts`, `mcf-runtime.repository.ts`, `mission-observability.service.ts`, do envelope v1 e da arquitetura E3.

---

## 1. Resumo executivo

- **Runtime NÃO emite envelopes outbound hoje.** Não há código de envio (`fetch`/emit/webhook) em nenhuma fonte do Runtime. `MCF-CONTROL-EVENT-v1.md` é um **contrato proposto** (status `DRAFT_FOR_SPECIALIST_REVIEW`) que define uma **capacidade nova do Runtime**, não uma capacidade existente. Nada neste close pode afirmar o contrário.
- **LÉO acertou os gaps** (falta `sourceSequence`; semântica de projeções; TTL/particionamento indigente) e **SOFIA acertou quase todas as correções técnicas** (PK, ordenação explícita, scope por missão, lógica de STALE, escopo do `idempotency_key`).
- **Porém ambos erraram no mesmo ponto crítico de engenharia:** a detecção de *gap* por aritmética de `sequence`. `sequence` é **identity de escopo de tabela** (global, não por missão): missões intercaladas consomem valores da mesma sequência, então *gaps naturais por missão são esperados*. Gap só se detecta por **reconciliação contra o Runtime**, nunca subtraindo `sequence`.
- **Segundo gap estrutural ignorado por ambos:** o `eventType` do envelope v1 **não alinha com o enum real do Runtime** (`GATE_REQUIRED`, `GATE_REJECTED`, `EXTERNAL_ACTION_*`, `PERMISSION_DENIED`, `RECOVERY_*`, `MISSION_BLOCKED_ALERT_RAISED`) — o envelope propõe `GATE_OPENED/GATE_RESOLVED`, `PHASE_*`, `AGENT_ASSIGNED`, `HANDOFF_CREATED`. Contrato não fecha sem mapear os dois.
- **Veredito:** APROVO com correções obrigatórias (alinea LÉO/SOFIA), **mais 4 correções de engenharia novas** (assinadas abaixo). E3 não fecha sem o enum de eventos resolvido do repositório MCF e sem a coluna `source_sequence` no ledger do Control Center.

---

## 2. Fatos de referência (provados nas fontes)

| # | Fato | Prova |
|---|------|-------|
| F1 | PK de `mcf_events` é **`id`** (text). `sequence` é **`bigint generated always as identity unique`** (ordenação), **não PK**. | `MCF-RUNTIME-0013.sql` L80-82 |
| F2 | Identity `sequence` é **escopo de tabela (global)** — uma sequência única compartilhada por todas as missões. `(mission_id, sequence)` e `(phase_id, sequence)` são apenas índices de consulta. | SQL L82, L95-96 |
| F3 | `listEvents` ordena **explicitamente** `order by "sequence" asc`. | `postgres-mcf-runtime.repository.ts` L651 |
| F4 | `mcf_events` tem `idempotency_key text not null unique`. | SQL L88 |
| F5 | `idempotency_key` é usada internamente pelo Runtime para dedupe (ex.: `completePendingPhase`, padrão `mission:${id}:blocked-alert:v${version}`). | `postgres-mcf-runtime.repository.ts` L419-422; `mission-observability.service.ts` L288 |
| F6 | `mcf_missions.version` é contador **per-missão** de atualização de estado (optimistic lock), incrementado no `UPDATE`. | SQL L17; repo L273, L602 |
| F7 | O `McfEventRecord` persistido só carrega `id, missionId, phaseId, agentId, eventType, payload, idempotencyKey, occurredAt`. Não há colunas `commit_sha`, `skill_id`, `mission_version`, `repository` em `mcf_events`. | `mcf-runtime.repository.ts`; SQL L80-89 |
| F8 | Event types reais usados pelo Runtime (subset visível): `MISSION_STATE_CHANGED`, `PERMISSION_DENIED`, `EVIDENCE_REJECTED`, `EXTERNAL_ACTION_FAILED/ABANDONED`, `GATE_REQUIRED/GATE_APPROVED/GATE_REJECTED`, `RECOVERY_STARTED/COMPLETED`, `MISSION_BLOCKED_ALERT_RAISED`. | `mission-observability.service.ts` L31-38, L155, L174, L278 |
| F9 | Nenhuma capacidade outbound (emit/webhook/fetch) no Runtime das fontes. | grep nos 3 arquivos das fontes |
| F10 | `mcf_handoffs` é tabela **transacional real** no Runtime (não projeção derivada como as projeções do CC). | SQL L65-78 |
| F11 | Não existe tabela `runtime_snapshots` no schema 0013; continuidade vive em `contract.continuityCheckpointRef`. | SQL completo; `mission-observability.service.ts` L158 |

---

## 3. Decisões canônicas propostas (fechamento para E3)

### D1 — Event ID / sequence / mapping (Handoff item 1)
- **`eventId` → `mcf_events.id` (text).** É a PK do Runtime e **a única chave de idempotência exposta** ao Control Center. Dedupe no CC é por `eventId` único em `source_events`.
- **`sourceSequence` → `mcf_events.sequence` (bigint).** É **exclusivamente** a fonte de ordem canônica. **Não** é chave de idempotência nem garantia de ausência de gap.
- **`idempotency_key` permanece interno ao Runtime; fora do envelope.** O CC não tem como (nem deve) validá-la.
- Regra de ingest: `eventId` repetido em `source_events` → **REJECT**; `sourceSequence` serve para **ordenar** a aplicação, não para rejeitar.

### D2 — Idempotência / ordering / out-of-order / gaps (Handoff item 2)
- **Garantias que o Runtime de fato dá:**
  1. Unicidade de evento por `id` (PK).
  2. Ordem de *persistência* monotônica por `sequence` (escopo de tabela → dentro de cada missão é crescente).
  3. Dedupe interno por `idempotency_key`.
  4. `listEvents` em ordem asc.
- **Garantias que o Runtime NÃO dá (e que o CC não pode inventar):**
  1. **Nenhuma garantia de `gapless`** por missão — sequência é global e missões intercaladas criam gaps naturais.
  2. **Nenhuma garantia de entrega/ordem no transporte** HTTP outbound (nem sequência implementada).
  3. **Nenhum protocolo de retry/compensação** de envio nas fontes.
- **Regras novas do CC (permitidas por E3):**
  - Aplicar eventos em ordem `sourceSequence asc` por `missionId` (buffer/delay em caso de entrega fora de ordem).
  - *Gap*: **detecção por reconciliação** contra o Runtime (watermark `min/max sourceSequence` + periodic catch-up), **não** por `sequence[n] - sequence[n-1] > 1`.
  - *Out-of-order de transporte*: evento com `sourceSequence` ≤ último aplicado para a missão → **reordenar/rejeitar como duplicata de reenvio**, nunca aplicar fora de ordem.
  - *Clock skew*: `occurredAt` é informativo; **não** usá-lo para ordenar, apenas para classificar saúde (D3).

### D3 — Semântica implementável LIVE/STALE/DEGRADED/UNKNOWN (Handoff item 3)
Definição operacional única, com `received_at` fixado pela **agenda do Control Center** no instante do ingest (UTC):
- **LIVE**: projeção aponta para `eventId` presente em `source_events` (aceito via receipt), com `occurred_at`, `received_at`, `source` e (quando aplicável) SHA/versão registrados, **e** `(received_at − occurred_at) ≤ tolerância` **e** a fonte do Runtime respondeu dentro do intervalo de *heartbeat* + captura o estado atual. `live` é derivado e explícito (como o `volatileState.live: true` do Runtime).
- **STALE**: dado presente porém uma invariante de atualidade falhou — fonte não respondeu dentro do *heartbeat*; ou latência de chegada `(received_at − occurred_at) > limiar`; ou projeção não atualizada dentro de janela. Mantém o último estado conhecido, **marcado**, nunca apresentado como LIVE.
- **DEGRADED**: parcial — apenas subconjunto de eventos verificado (gap confirmado por reconciliação), ou consulta parcial à fonte, ou parte das referências resolvida. Mostra o que há, rotulado como incompleto.
- **UNKNOWN**: o valor exibido **não tem** evento/receipt verificável no ledger — nunca ingerido, rejeitado, ou referência ausente. **UI obrigatoriamente exibe UNKNOWN** (a arquitetura proíbe simular LIVE).
- **Clock skew (novo, fechado com rigor):** `occurred_at > received_at` além da tolerância (ex.: 5 min) → rotular **WARN/skew** no ingest e **não** promover a projeção a LIVE até reconciliação; não é rejeição de ingest nem classificação STALE por si.

### D4 — TTL / retenção / particionamento (Handoff item 4)
- **É requisito E3 (invariante arquitetural):** `source_events` é **append-only, sem TTL, sem deleção** — ledger auditável. Deve constar em `E3-CONTROL-CENTER-ARCHITECTURE.md`.
- **É decisão do Control Center (agora, configurável):** retenção de `ingest_receipts` (ex.: 90 dias, **configurável**, revisável) — limpeza só após reconciliação. Projeções **sem TTL** (reconstruídas do ledger).
- **Fica para depois:** particionamento por `occurred_at`/data, arquivamento e cold-storage. **MVP: apenas índices** (alinhado a SOFIA; `source_events` indexado por `(event_id)` PK + `(source)`, e watermark por missão).
- Corrigir explicitly: **não particionar por `mission_id`** (milhares de partições); se um dia, por **data**.

### D5 — Escopo Runtime × Control Center (transversal, para documentar)
- **Do Runtime (fonte de verdade):** ledger `mcf_events` (PK `id`, `sequence`, `idempotency_key` interno), `mcf_missions/версион`, `mcf_phases`, `mcf_tool_receipts`, `mcf_handoffs`, `version`.
- **Do Control Center (novo, permitido por E3):** outbound envelope; `source_events`+`ingest_receipts`; projeções; dedupe por `eventId`; ordering; health LIVE/STALE/DEGRADED/UNKNOWN; TTL de receipts; reconciliação de gaps. **Não atribuir ao Runtime** capacidades que não existem nas fontes.

---

## 4. LÉO × SOFIA — adjudicação material

| # | Ponto | LÉO | SOFIA | Decisão RAFAEL (prova) |
|---|-------|-----|-------|--------------------------|
| A | PK `mcf_events` | `sequence` é PK | `id` é PK | **SOFIA (F1):** `id` L81 é PK; `sequence` L82 é unique identity. |
| B | Base da ordenação `listEvents` | implícita (pois `sequence` é "PK identity") | explícita `order by sequence asc` | **SOFIA (F3):** repo L651. Justificativa técnica de LÉO incorreta. |
| C | Escopo do out-of-order | por (mission, phase) | por (mission), não phase | **SOFIA no escopo**, com correção minha: identity é global; subset por missão é crescente, **não gapless**. Validar só por `missionId` recebida. |
| D | Fórmula STALE | `occurredAt > receivedAt → STALE` | `(receivedAt − occurredAt) > limiar → STALE`; `occurredAt > receivedAt → skew` | **SOFIA (invertida por LÉO).** Latência normal é `received ≥ occurred`. |
| E | "`eventId` ausente em `source_events` → STALE" | STALE/REJECT | lógica circular; significa "ainda não ingerido" | **SOFIA.** Pertence ao pipeline de ingest/UNKNOWN, não a STALE. |
| F | Dedupe por `idempotency_key` no CC | CC deve REJECT se chave existir | CC não a acessa; valida só `eventId` | **SOFIA (F5/F9):** envelope não expõe; Runtime já faz dedupe interno (repo L419-422). |
| G | `HANDOFF_RECEIVED` | adicionar | redundante; preferir `HANDOFF_ACCEPTED/REJECTED` | **SOFIA parcial.** `mcf_handoffs` é tabela real (F10) → `HANDOFF_CREATED` factível; detalhe de resposta é desenho futuro (E6), **PROPOSTO**, não evidenciado. |
| H | `RUNTIME_SNAPSHOT_CREATED/DELETED` | adicionar | extrapolado, não evidenciado | **SOFIA (F11):** sem tabela/serviço de snapshot; **PROPOSTO/adiado.** |
| I | Particionamento `source_events` | por `mission_id` MVP | índices no MVP; futuro por data | **SOFIA** + D4: particionar por missão é anti-padrão; MVP só índices; futuro por `occurred_at`. |
| J | TTL `ingest_receipts` | 90 dias como decisão | arbitrário; configurável; decisão do CC | **SOFIA nuance (D4):** decisão do CC, configurável, valor deferido; não é requisito do Runtime. |
| K | `mission.version` | versão de estado/otimista, não ordem | idem | **CONVERGEM (F6):** aceito por ambos; `version` ≠ `sourceSequence`. |
| L | Adicionar `sourceSequence`, `handoffId`, `snapshotId/URL` | sim | sim | **CONVERGEM:** `sourceSequence` crítico (F1-F3); `snapshotId/URL` só se feature de snapshot virar requisito. |
| M | Detecção de **gap por aritmética** de `sequence` | "se sequence não é maior que último conhecido → REJECT" | "se chega N e último é N−5 → alertar gap" | **REJEITADO em ambos (novo, F2):** identity global + intercalação ⇒ gaps naturais por missão; gap só via reconciliação. **Correção nova de RAFAEL.** |

---

## 5. Mudanças exatas de contrato/arquitetura

### 5.1 `MCF-CONTROL-EVENT-v1.md` (mínimas obrigatórias)
1. **Adicionar campo** `"sourceSequence": "integer"` — mapeia `mcf_events.sequence`; **ordenar por ele, nunca usar para dedupe/gap**.
2. **Reescrever Regra 1:** `eventId` = `mcf_events.id`; é a chave de idempotência no CC; `idempotency_key` é interna ao Runtime e **não** entra no envelope.
3. **Regra STALE nova:** `(receivedAt − occurredAt) > limite → STALE`; `occurredAt > receivedAt` além de tolerância → **WARN (clock skew)**, não rejeição.
4. **Regra de ordenação nova:** aplicação por `sourceSequence asc` por `missionId`; evento fora de ordem → reordenar/rejeitar como reenvio, nunca aplicar fora de ordem.
5. **Marcar event types não evidenciados no Runtime como `PROPOSED`:** `PHASE_STARTED/COMPLETED`, `AGENT_ASSIGNED`, `HANDOFF_CREATED` (factível — F10), `GATE_OPENED/GATE_RESOLVED`, `RUNTIME_HEALTH_CHANGED`; e **alinhar à enum real** do Runtime (F8). `RUNTIME_SNAPSHOT_*`, `HANDOFF_ACCEPTED/REJECTED` → futuros.
6. **Nota de viabilidade:** campos `repository`, `commitSha`, `missionVersion`, `skillId` **não são colunas de `mcf_events`** (F7) — devem ser preenchidos em emissão a partir de `mcf_missions.version`, `mcf_phases.skill_id`, `mcf_tool_receipts.commit_sha` e contexto. Documentar a origem de cada um; remover ou expressar como derivados.
7. **Regra 7 (LIVE) vira D3 completo** (LIVE/STALE/DEGRADED/UNKNOWN com clock skew).

### 5.2 `E3-CONTROL-CENTER-ARCHITECTURE.md` (mínimas obrigatórias)
1. **Corrigir schema do ledger:** PK `mcf_events.id`; `sequence` = ordering identity; `idempotency_key` interno.
2. **`source_events` novo:** `event_id` (PK), `source_sequence` (bigint, ordering), `source`, `received_at`, `occurred_at`, `event_type`, `payload`, `accepted(status/valid)`, refs SHA/versão. **Migration adiciona `source_sequence bigint not null`** quando criar a tabela.
3. **Adicionar seção LIVE/STALE/DEGRADED/UNKNOWN** (arquitetura só cita STALE/DEGRADED/UNKNOWN) conforme D3.
4. **Out-of-order:** declarar ordering por `sourceSequence` por missão; detecção de gap por reconciliação (não aritmética).
5. **TTL/retenção:** `source_events` sem TTL (invariante E3); `ingest_receipts` retenção configurável (decisão CC); projeções sem TTL; **MVP índices apenas**, particionamento por data como futuro — **excluir particionamento por `mission_id`**.
6. **Separação Runtime × CC** explícita (D5) e marcar o envelope como **capacidade nova do Runtime a implementar**, não existente.
7. **Endpoint ingest:** adicionar regra de assinatura servidor-a-servidor e falha-fechada já prevista (envelope Regra 4), mantendo `POST /api/ingest/mcf`.

---

## 6. Riscos / gaps

- **[ALTO] Gap por aritmética de `sequence`** — metodologia proposta por LÉO/SOFIA gera falso alerta de perda onde não há perda (intercalação de missões). Mitigar: reconciliação/watermark, não subtração.
- **[ALTO] Enum de eventos desalinhado** — fechar contrato exige ver o enum `McfEventType` completo no repositório MCF (não presente neste pacote) e mapear envelope ↔ runtime. **Gate externo.**
- **[ALTO] Envelope alega campos fora do modelo de evento** (`commitSha`, `missionVersion`, `skillId`, `repository`) — sem origem definida, o emissor não tem como preenchê-los de forma verificável. Definir derivação (D4.6).
- **[MÉDIO] Sem protocolo outbound/retry no Runtime** — transporte HTTP desordenado/perdido é responsabilidade nova do CC; exigir heartbeat e reconciliação.
- **[MÉDIO] Clock skew** — sem tolerância definida, projeções podem ser promovidas a LIVE com timestamp incorreto. Fixar tolerância e regra (D3).
- **[BAIXO] Escalabilidade de `source_events`** — aceitável MVP (<~100k eventos); reavaliar particionamento por data em produção (fora de E3).

---

## 7. Blockers para fechar E3

1. **Enum `McfEventType` real do Runtime** (repositório `leon337/multiagent-collaboration-framework`) — necessário para alinhar o conjunto `eventType` do envelope (F8 vs envelope). Não disponível neste pacote.
2. **`source_sequence` no schema `source_events`** do CC (coluna obrigatória) + regras de ordering/duplicate no ingest.
3. **Aplicar correções mínimo-obrigatórias** listadas em §5.1 e §5.2 (PK, STALE, dedupe por `eventId`, particionamento).
4. **Aprovação do ponto de envio:** definir a fonte da derivação de `commitSha/missionVersion/skillId/repository` no emissor outbound (ou estreitar o envelope).
5. **(Gerenciado pelo MESTRE)** acordar política de reconciliação de gaps e tolerância de clock skew; validar em revisão única trifuncional (arquitetura/engenharia/gates).

---

## 8. Handoff objetivo ao MESTRE

1. **Ratificar** estas decisões canônicas D1–D5; incorporar as correções §5.1/§5.2 nos dois documentos (depois do fim do modo read-only, por quem detenha autoridade de escrita).
2. **Obter do repositório MCF o enum `McfEventType` completo** (Block 1) — depende de LÉO/segurança no repo, não deste pacote.
3. **Decidir TTL configurável de `ingest_receipts`** e **tolerância de clock skew** como decisões do Control Center (não bloqueiam E3 hard; fixam defaults para E4).
4. **Não mitificar outbound existente:** registrar explicitamente na arquitetura que envelope = capacidade nova do Runtime a implementar (E6), não garantia atual.
5. **Gate E3:** só fecha após Blocks 1–4. Não há bloqueio técnico irreversível; os riscos §6 são mitigáveis no desenho do ingest.
6. Nenhuma exclusão de fonte inventada; tudo provado em `input/sources/` (linhas citadas acima).

Fim do parecer. Nenhum arquivo foi criado, modificado ou apagado (modo read-only respeitado).