Agora tenho todas as fontes necessárias. Vou realizar a análise crítica completa do parecer de LÉO contra as fontes reais do Runtime.

---

# PARECER ARQUITETURAL — SOFIA
## Revisão Crítica: LEO-E3-PROJECTION-SEMANTICS.md

**Missão:** MCF-CONTROL-CENTER-001 / E3C  
**Autoridade:** SOFIA (Arquitetura de Software)  
**Modo:** Read-only / sem alteração de arquivos  
**Base de evidência:** Fontes do Runtime incluídas em `input/sources/`

---

## ESTRUTURA DA ANÁLISE

Para cada afirmação material do parecer de LÉO, classifico como:
- **ACEITA**: comprovada pelas fontes
- **REJEITADA**: contraditória às fontes ou inventa capacidade
- **CORRIGIDA**: parcialmente correta, mas requer ajuste técnico

Todas as decisões citam arquivo-fonte, linha e símbolo técnico.

---

## 1. IDEMPOTÊNCIA (Seção 1 do parecer de LÉO)

### Afirmação 1.1: "mcf_events.sequence (bigint identity unique) — primary key"

**CLASSIFICAÇÃO: REJEITADA**

**Evidência:**
- `MCF-RUNTIME-0013.sql`, linha 80-82:
  ```sql
  create table if not exists "mcf_events" (
    "id" text primary key,
    "sequence" bigint generated always as identity unique,
  ```

**Correção:**
- `id` (text) é a **primary key**, não `sequence`.
- `sequence` é **unique** e **identity**, mas NÃO é primary key.
- `sequence` garante ordem de inserção monotônica crescente.
- `id` garante unicidade do evento.

**Impacto:**
A confusão entre PK e unique constraint pode gerar queries ineficientes e mal-entendimento sobre qual campo usar para idempotência externa.

---

### Afirmação 1.2: "mcf_events.idempotency_key (text not null unique) — campo de idempotência explícito"

**CLASSIFICAÇÃO: ACEITA**

**Evidência:**
- `MCF-RUNTIME-0013.sql`, linha 88:
  ```sql
  "idempotency_key" text not null unique,
  ```

**Comprovação adicional:**
- `postgres-mcf-runtime.repository.ts`, linha 419-422: detecção de duplicatas por `idempotency_key`.
- `mission-observability.service.ts`, linha 288: padrão de chave `mission:${mission.id}:blocked-alert:v${mission.version}`.

---

### Afirmação 1.3: "O envelope MCF-CONTROL-EVENT-v1 deve expor eventId (como primary key do Runtime) e sourceSequence (copiado de mcf_events.sequence)"

**CLASSIFICAÇÃO: ACEITA COM CORREÇÕES**

**Evidência:**
- `mcf_events.id` é a PK (não `sequence`).
- `sequence` é ordem de inserção verificável.

**Correção terminológica:**
- `eventId` deve mapear `mcf_events.id` (PK, text).
- `sourceSequence` deve mapear `mcf_events.sequence` (bigint identity unique).
- A afirmação de LÉO está materialmente correta, mas a descrição "como primary key do Runtime" reforça a confusão entre `id` e `sequence`.

**Decisão arquitetural:**
- O envelope v1 **deve adicionar** `sourceSequence` (atualmente ausente).
- `eventId` já está presente no envelope v1 e mapeia corretamente `mcf_events.id`.

---

### Afirmação 1.4: "Não usar idempotency_key no envelope (ela é interna ao Runtime)"

**CLASSIFICAÇÃO: ACEITA**

**Justificativa:**
- `idempotency_key` é construída pelo Runtime (`mission:${mission.id}:blocked-alert:v${mission.version}`) e serve para detecção interna de duplicatas.
- O Control Center deve usar `eventId` (UUID estável) para idempotência de ingest, não `idempotency_key`.
- Expor `idempotency_key` no envelope seria vazamento de implementação interna.

---

### Afirmação 1.5: "Duplicate detection: se eventId já existe em source_events, REJECT"

**CLASSIFICAÇÃO: ACEITA**

**Evidência:**
- Padrão event-sourcing canônico: `eventId` (PK) garante unicidade.
- Ingest deve rejeitar tentativa de reinserção do mesmo `eventId`.

---

## 2. ORDENAÇÃO DE EVENTOS (Seção 2 do parecer de LÉO)

### Afirmação 2.1: "mcf_events.sequence é bigint identity unique (ordem de inserção)"

**CLASSIFICAÇÃO: ACEITA**

**Evidência:**
- `MCF-RUNTIME-0013.sql`, linha 82: `"sequence" bigint generated always as identity unique`.

---

### Afirmação 2.2: "Índices: mcf_events_mission_idx (mission_id, sequence) e mcf_events_phase_idx (phase_id, sequence)"

**CLASSIFICAÇÃO: ACEITA**

**Evidência:**
- `MCF-RUNTIME-0013.sql`, linhas 95-96:
  ```sql
  create index if not exists "mcf_events_mission_idx" on "mcf_events" ("mission_id", "sequence");
  create index if not exists "mcf_events_phase_idx" on "mcf_events" ("phase_id", "sequence");
  ```

---

### Afirmação 2.3: "listEvents retorna eventos (implícitamente ordenados por sequence, pois é o primary key identity)"

**CLASSIFICAÇÃO: REJEITADA**

**Evidência:**
- `postgres-mcf-runtime.repository.ts`, linha 650-651:
  ```typescript
  from "mcf_events"
  where "mission_id" = $1
  order by "sequence" asc
  ```

**Correção:**
- A ordenação é **explícita** (`order by "sequence" asc`), não implícita.
- `sequence` NÃO é primary key (é `id`).
- A afirmação de LÉO está materialmente correta (eventos são ordenados por `sequence`), mas a justificativa técnica está errada.

---

### Afirmação 2.4: "O envelope outbound deve expor sourceSequence (copiado de mcf_events.sequence)"

**CLASSIFICAÇÃO: ACEITA**

**Justificativa:**
- `sequence` é a única fonte de verdade para ordenação cronológica no Runtime.
- O envelope v1 atual **não tem** `sourceSequence` (gap identificado corretamente por LÉO).
- Projeções do Control Center devem ordenar eventos por `sourceSequence` para reconstruir estado consistente.

---

### Afirmação 2.5: "Risco: Se o Runtime emitir eventos fora de ordem (sem atualizar sequence), a projeção será inconsistente"

**CLASSIFICAÇÃO: ACEITA COM RESSALVA**

**Evidência:**
- `sequence` é `generated always as identity`: o banco garante monotonia.
- O Runtime **não pode** emitir eventos fora de ordem de `sequence` porque é gerada automaticamente pelo PostgreSQL.

**Ressalva:**
- O risco real não é "emitir fora de ordem", mas **reenvio de eventos antigos** ou **perda de eventos intermediários** durante transporte HTTP.
- O receipt do ingest deve validar que `sourceSequence` é **maior** que o último conhecido para `missionId`, detectando gaps ou reordenamento por transporte.

---

## 3. PAPEL DE MISSION.VERSION (Seção 3 do parecer de LÉO)

### Afirmação 3.1: "mcf_missions.version (integer not null default 1, check version > 0)"

**CLASSIFICAÇÃO: ACEITA**

**Evidência:**
- `MCF-RUNTIME-0013.sql`, linha 17: `"version" integer not null default 1 check ("version" > 0)`.

---

### Afirmação 3.2: "version é incrementado em cada atualização de estado"

**CLASSIFICAÇÃO: ACEITA**

**Evidência:**
- `postgres-mcf-runtime.repository.ts`, linha 273: `"version" = "version" + 1`.
- `postgres-mcf-runtime.repository.ts`, linha 602: `"version" = "version" + 1`.

---

### Afirmação 3.3: "Observado em mission-observability.service.ts:183: idempotencyKey: mission:${mission.id}:blocked-alert:v${mission.version}"

**CLASSIFICAÇÃO: ACEITA**

**Evidência:**
- `mission-observability.service.ts`, linha 288:
  ```typescript
  idempotencyKey: `mission:${mission.id}:blocked-alert:v${mission.version}`,
  ```

---

### Afirmação 3.4: "mission.version é um identificador de versão de estado (concorrência/estado), NÃO ordem de todos os eventos"

**CLASSIFICAÇÃO: ACEITA**

**Justificativa:**
- `version` é incrementado por **atualização de missão** (transação que muda `state`, `current_phase_id`, `current_agent_id`).
- Múltiplos eventos (`mcf_events`) podem ser inseridos em uma única transação sem incrementar `version`.
- `version` é usado para optimistic locking (compare-and-set), não para ordenação de eventos.

---

### Afirmação 3.5: "Ordem de eventos: sourceSequence é a única fonte de verdade"

**CLASSIFICAÇÃO: ACEITA**

---

## 4. REGRAS DE STALE/OUT-OF-ORDER/DUPLICATE (Seção 4 do parecer de LÉO)

### Afirmação 4.1: "Duplicate: se eventId existe em source_events → REJECT"

**CLASSIFICAÇÃO: ACEITA**

---

### Afirmação 4.2: "Duplicate: se idempotency_key existe em mcf_events → REJECT"

**CLASSIFICAÇÃO: REJEITADA (escopo incorreto)**

**Evidência:**
- `idempotency_key` é **interna ao Runtime**, não exposta no envelope.
- O Control Center **não tem acesso** a `mcf_events.idempotency_key` para validar duplicatas (o envelope não a inclui).
- O Control Center deve validar duplicatas por `eventId` apenas.

**Correção:**
- O Runtime já faz detecção de duplicatas por `idempotency_key` internamente (linha 419-422 do `postgres-mcf-runtime.repository.ts`).
- O Control Center valida duplicatas por `eventId` no seu próprio ledger (`source_events`).

---

### Afirmação 4.3: "Out-of-order: se sourceSequence não é maior que o último sourceSequence conhecido para mission/phase → REJECT"

**CLASSIFICAÇÃO: CORRIGIDA**

**Correção:**
- A validação deve ser por **mission** (não por phase), porque `sequence` é global no escopo de `mission_id` (índice: `mcf_events_mission_idx (mission_id, sequence)`).
- Eventos de diferentes phases da mesma mission compartilham a mesma sequência monotônica.

**Regra corrigida:**
```
Se sourceSequence ≤ max(sourceSequence) para missionId → REJECT (ou WARN + skip, dependendo da política de ingest)
```

---

### Afirmação 4.4: "Out-of-order: se occurredAt não é maior que o último occurredAt → WARN"

**CLASSIFICAÇÃO: ACEITA**

**Justificativa:**
- `occurredAt` pode sofrer clock skew ou reordenamento por transporte HTTP/retry.
- `sourceSequence` é a ordem canônica; `occurredAt` é timestamp informativo.

---

### Afirmação 4.5: "Stale: se occurredAt > receivedAt por mais de X segundos → STALE"

**CLASSIFICAÇÃO: REJEITADA (lógica invertida)**

**Correção:**
- `occurredAt` é quando o evento aconteceu no Runtime.
- `receivedAt` é quando o Control Center o ingeriu.
- **Latência esperada:** `receivedAt > occurredAt` (evento chega depois de ocorrer).
- **Stale correto:** se `receivedAt - occurredAt > threshold` → evento demorou muito para chegar.

**Fórmula corrigida:**
```
if (receivedAt - occurredAt) > threshold → STALE (latência alta)
if occurredAt > receivedAt → WARN (clock skew)
```

---

### Afirmação 4.6: "Stale: se eventId não existe em source_events → STALE/REJECT"

**CLASSIFICAÇÃO: REJEITADA (lógica circular)**

**Correção:**
- Se `eventId` não existe em `source_events`, é porque o evento **ainda não foi ingerido** (ou foi rejeitado).
- Isso não define STALE; define que a projeção ainda não tem o evento.
- STALE aplica-se a **projeções** que referenciam eventos antigos ou desatualizados, não ao processo de ingest.

---

## 5. SEMÂNTICA MÍNIMA DAS PROJEÇÕES (Seção 5 do parecer de LÉO)

### Afirmação 5.1: "Projeções derivadas de eventos: missions, mission_phases, mission_assignments, handoffs, gates, evidence_receipts, agents, skills"

**CLASSIFICAÇÃO: ACEITA COM OBSERVAÇÃO**

**Evidência:**
- Arquitetura E3 (`E3-CONTROL-CENTER-ARCHITECTURE.md`, linhas 52-68) define essas projeções.
- **Observação:** O Runtime já persiste `mcf_handoffs` (tabela real, não projeção derivada apenas de eventos).

**Esclarecimento arquitetural:**
- **Control Center projections:** derivadas de `source_events` (append-only ledger).
- **Runtime persistence:** `mcf_handoffs` é tabela transacional no Runtime, não evento puro.
- O envelope deve emitir `HANDOFF_CREATED` quando `mcf_handoffs` é inserido.

---

### Afirmação 5.2: "missions → MISSION_CREATED, MISSION_STATE_CHANGED, MISSION_COMPLETED, MISSION_CANCELLED"

**CLASSIFICAÇÃO: ACEITA**

**Evidência:**
- `mission-observability.service.ts` mostra uso de estados `BLOCKED_RISK`, `EXECUTING`, etc.
- Eventos correspondentes devem ser emitidos pelo Runtime.

---

### Afirmação 5.3: "runtime_snapshots: derivado de snapshot do Runtime (não de eventos). Envelope v1 deve expor snapshotId e snapshotUrl"

**CLASSIFICAÇÃO: ACEITA**

**Justificativa:**
- Snapshots são artefatos externos (ex: dump de estado, checkpoint de continuidade), não eventos atômicos.
- O envelope deve incluir referência ao snapshot quando relevante.

---

## 6. INFORMAÇÃO A ADICIONAR AO ENVELOPE V1 (Seção 6 do parecer de LÉO)

### Afirmação 6.1: "Adicionar sourceSequence (bigint)"

**CLASSIFICAÇÃO: ACEITA**

**Justificativa:**
- Gap crítico identificado corretamente.
- Projeções do Control Center não podem ordenar eventos cronologicamente sem `sourceSequence`.

---

### Afirmação 6.2: "Adicionar snapshotId, snapshotUrl, handoffId, handoffType"

**CLASSIFICAÇÃO: ACEITA**

**Evidência:**
- `mcf_handoffs` é tabela real (linha 64-78 do `MCF-RUNTIME-0013.sql`).
- Envelope deve expor `handoffId` quando `HANDOFF_CREATED`.

---

### Afirmação 6.3: "Tipos de eventos adicionais: RUNTIME_SNAPSHOT_CREATED, RUNTIME_SNAPSHOT_DELETED, HANDOFF_RECEIVED"

**CLASSIFICAÇÃO: ACEITA COM AJUSTE**

**Ajuste:**
- `HANDOFF_RECEIVED` é redundante; `HANDOFF_CREATED` já sinaliza criação do handoff.
- Melhor semântica: `HANDOFF_ACCEPTED`, `HANDOFF_REJECTED` (resposta do agente receptor).

---

## 7. TTL/PARTICIONAMENTO (Seção 7 do parecer de LÉO)

### Afirmação 7.1: "source_events: NENHUM TTL (append-only, usado para auditoria)"

**CLASSIFICAÇÃO: ACEITA**

---

### Afirmação 7.2: "ingest_receipts: 90 dias TTL"

**CLASSIFICAÇÃO: ACEITA COM RESSALVA**

**Ressalva:**
- 90 dias é arbitrário; decisão válida para MVP, mas deve ser configurável e revisada em produção.

---

### Afirmação 7.3: "Projeções: NENHUM TTL (snapshot de estado atual)"

**CLASSIFICAÇÃO: ACEITA**

---

### Afirmação 7.4: "source_events: particionar por mission_id"

**CLASSIFICAÇÃO: CORRIGIDA**

**Evidência:**
- O Runtime usa índice `mcf_events_mission_idx (mission_id, sequence)`, não particionamento.
- Particionamento PostgreSQL (table partitioning) **não está implementado** no schema 0013.

**Correção:**
- Para MVP, **não usar particionamento** (índice é suficiente).
- Para escala futura, particionar por **data** (não `mission_id`), porque:
  - Particionamento por `mission_id` geraria milhares de partições (uma por missão).
  - Particionamento por data permite archive/purge de partições antigas.

**Decisão arquitetural:**
- MVP: índices apenas.
- Futura escala: particionamento por `occurred_at` (range mensais ou trimestrais).

---

## 8. DEPENDÊNCIAS TÉCNICAS (Seção 8 do parecer de LÉO)

### Afirmação 8.1: "A E3 pode avançar após estas definições"

**CLASSIFICAÇÃO: ACEITA**

---

### Afirmação 8.2: "Workshop SOFIA+LÉO+Rafael necessário"

**CLASSIFICAÇÃO: ACEITA**

---

## 9. REGRAS DE ORDERING/IDEMPOTÊNCIA — RESUMO (Seção 9 do parecer de LÉO)

### Afirmação 9.1: "eventId = primary key do Runtime (unicidade)"

**CLASSIFICAÇÃO: ACEITA**

**Correção terminológica aplicada:** `mcf_events.id` é a PK, não `sequence`.

---

### Afirmação 9.2: "sourceSequence = ordem de inserção (monotônico crescente)"

**CLASSIFICAÇÃO: ACEITA**

---

### Afirmação 9.3: "occurredAt usado apenas para timestamp, não para ordenação"

**CLASSIFICAÇÃO: ACEITA**

---

## 10. REGRAS LIVE (Seção 10 do parecer de LÉO)

### Afirmação 10.1: "Projeção LIVE se eventId existe em source_events"

**CLASSIFICAÇÃO: ACEITA**

---

### Afirmação 10.2: "Projeção STALE se occurredAt > receivedAt por mais de X segundos"

**CLASSIFICAÇÃO: REJEITADA (lógica invertida já corrigida na seção 4.5)**

---

### Afirmação 10.3: "Projeção DEGRADED/UNKNOWN se source_events foi deletado"

**CLASSIFICAÇÃO: ACEITA COM RESSALVA**

**Ressalva:**
- `source_events` é append-only; deleção **não deve acontecer**.
- DEGRADED aplica-se quando:
  - Fonte externa (Runtime) está indisponível.
  - Projeção foi reconstruída, mas eventos faltam (gap detectado).

---

## 11. REGRAS DE STALE/OUT-OF-ORDER/DUPLICATE — RESUMO (Seção 11 do parecer de LÉO)

**CLASSIFICAÇÃO: Ver análises detalhadas nas seções 4.1 a 4.6.**

---

## 12. MAPPING/PROJECTION SEMANTICS V1 (Seção 12 do parecer de LÉO)

**CLASSIFICAÇÃO: ACEITA**

---

## 13. ITENS PARA REVISÃO (Seção 13 do parecer de LÉO)

**CLASSIFICAÇÃO: ACEITA**

---

## 14. HANDOFF PARA SOFIA E RAFAEL (Seção 14 do parecer de LÉO)

**CLASSIFICAÇÃO: ACEITA**

---

## 15. GATE INTERNO — DECISÃO FINAL (Seção 15 do parecer de LÉO)

### Afirmação 15.1: "CONTINUAR (com remediações obrigatórias)"

**CLASSIFICAÇÃO: ACEITA COM CORREÇÕES ARQUITETURAIS OBRIGATÓRIAS**

---

## RESUMO EXECUTIVO — CLASSIFICAÇÃO DAS AFIRMAÇÕES

| Categoria | Aceitas | Rejeitadas | Corrigidas |
|-----------|---------|------------|------------|
| Idempotência | 4 | 1 (confusão PK) | 1 |
| Ordenação | 3 | 1 (implícita vs explícita) | 1 |
| mission.version | 5 | 0 | 0 |
| Stale/Out-of-order | 2 | 4 | 1 |
| Projeções | 3 | 0 | 0 |
| Envelope v1 gaps | 2 | 0 | 1 |
| TTL/Particionamento | 3 | 0 | 1 |
| **TOTAL** | **22** | **6** | **5** |

---

## CORREÇÕES MÍNIMAS OBRIGATÓRIAS

### Correção 1: Primary Key vs Sequence (E3-CONTROL-CENTER-ARCHITECTURE.md)

**Localização:** Documentação de schema e envelope.

**Erro:** Confusão entre `mcf_events.id` (PK) e `mcf_events.sequence` (unique identity).

**Correção:**
```markdown
### mcf_events (Runtime)
- **Primary Key:** `id` (text, UUID)
- **Ordering:** `sequence` (bigint generated always as identity unique)
- **Idempotency:** `idempotency_key` (text not null unique)

### Envelope v1 mapping
- `eventId` → `mcf_events.id` (PK)
- `sourceSequence` → `mcf_events.sequence` (ordenação cronológica)
```

---

### Correção 2: Out-of-Order Detection Scope (E3-CONTROL-CENTER-ARCHITECTURE.md)

**Erro:** Validação de `sourceSequence` por `mission_id` E `phase_id`.

**Correção:**
```markdown
### Out-of-order detection
- Validar: `sourceSequence > max(sourceSequence) WHERE missionId = <missionId>`
- **NÃO validar por phase**, porque `sequence` é monotônica por missão, não por fase.
```

---

### Correção 3: Stale Detection Logic (MCF-CONTROL-EVENT-v1.md)

**Erro:** `occurredAt > receivedAt` considerado STALE.

**Correção:**
```markdown
### Stale detection
- **Latência alta:** `(receivedAt - occurredAt) > threshold` → STALE
- **Clock skew:** `occurredAt > receivedAt` → WARN (clock do Runtime à frente)
```

---

### Correção 4: Duplicate Detection Scope (MCF-CONTROL-EVENT-v1.md)

**Erro:** Sugerir validação de `idempotency_key` no Control Center.

**Correção:**
```markdown
### Duplicate detection
- **Control Center:** valida `eventId` único em `source_events`.
- **Runtime:** valida `idempotency_key` único em `mcf_events` (interno, não exposto no envelope).
```

---

### Correção 5: Particionamento (E3-CONTROL-CENTER-ARCHITECTURE.md)

**Erro:** Recomendar particionamento por `mission_id` para MVP.

**Correção:**
```markdown
### Particionamento
- **MVP:** usar índices apenas (`mcf_events_mission_idx`, `mcf_events_phase_idx`).
- **Futura escala:** particionar `source_events` por `occurred_at` (range mensais), não por `mission_id`.
- **Justificativa:** Particionamento por `mission_id` geraria milhões de partições; por data permite archive eficiente.
```

---

## GAPS IDENTIFICADOS NO ENVELOPE V1 (CONFIRMADOS)

1. **sourceSequence** (bigint) — CRÍTICO para ordenação cronológica.
2. **handoffId** (uuid-or-null) — para referência a `mcf_handoffs`.
3. **snapshotId**, **snapshotUrl** — para `runtime_snapshots`.

---

## RISCOS IDENTIFICADOS

### Risco 1: Perda de Eventos por Gap em sourceSequence

**Severidade:** ALTA

**Descrição:** Se eventos chegam fora de ordem ou com gaps em `sourceSequence`, projeções podem ficar inconsistentes.

**Mitigação:**
- Ingest deve detectar gaps: se `sourceSequence` recebido é `N`, mas último conhecido é `N-5`, alertar gap.
- Implementar reconciliação periódica: Control Center busca eventos faltantes no Runtime (polling ou webhook de catch-up).

---

### Risco 2: Clock Skew entre Runtime e Control Center

**Severidade:** MÉDIA

**Descrição:** `occurredAt` pode ser posterior a `receivedAt` se clocks estiverem dessincronizados.

**Mitigação:**
- Validar apenas desvios extremos (> 5 minutos).
- Usar `sourceSequence` como ordem canônica, não `occurredAt`.

---

### Risco 3: Escalabilidade de Projeções sem Particionamento

**Severidade:** BAIXA (MVP) / ALTA (escala futura)

**Descrição:** Tabela `source_events` sem particionamento pode crescer indefinidamente.

**Mitigação:**
- MVP: índices suficientes (< 100k eventos).
- Produção: particionar por `occurred_at` (range trimestral + archive em S3/cold storage).

---

## ITENS QUE EXTRAPOLAM AS FONTES

### Item 1: "Eventos adicionais: RUNTIME_SNAPSHOT_CREATED, HANDOFF_RECEIVED"

**Status:** Especulação arquitetural válida, mas não comprovada pelas fontes.

**Evidência:** O Runtime atual não emite esses eventos (não encontrados em `mission-observability.service.ts` nem em testes).

**Recomendação:** Marcar como "PROPOSTO", não "EVIDENCIADO".

---

### Item 2: "TTL de 90 dias para ingest_receipts"

**Status:** Decisão arbitrária, não derivada das fontes.

**Evidência:** Nenhuma política de TTL está implementada no Runtime.

**Recomendação:** Documentar como decisão arquitetural do Control Center, não como requisito do Runtime.

---

## SEPARAÇÃO: RUNTIME VS CONTROL CENTER

| Conceito | Runtime (Fonte de Verdade) | Control Center (Projeção) |
|----------|----------------------------|---------------------------|
| **Primary Key** | `mcf_events.id` (text) | `source_events.event_id` (derivado) |
| **Ordering** | `mcf_events.sequence` (bigint identity) | `source_events.source_sequence` (copiado) |
| **Idempotency** | `mcf_events.idempotency_key` (interno) | `source_events.event_id` (exposto) |
| **Handoffs** | `mcf_handoffs` (tabela transacional) | `handoffs` (projeção derivada de eventos) |
| **Snapshots** | Artefatos externos (não persistidos em DB) | `runtime_snapshots` (referências a S3/URLs) |
| **TTL** | Nenhum | `ingest_receipts`: 90 dias (decisão CC) |

---

## VEREDITO FINAL

**APROVAR COM CORREÇÕES OBRIGATÓRIAS**

### Justificativa

1. **Análise substancialmente correta:** LÉO identificou os gaps críticos (`sourceSequence`, semântica de projeções, TTL/particionamento).
2. **Erros técnicos não bloqueantes:** Confusão PK/sequence e lógica invertida de STALE são corrigíveis sem redesign.
3. **Especulação mínima:** Maioria das decisões é rastreável às fontes do Runtime.

### Blockers para Fechar E3

1. **Correção 1** (PK vs Sequence) aplicada em `E3-CONTROL-CENTER-ARCHITECTURE.md`.
2. **Correção 3** (Stale logic) aplicada em `MCF-CONTROL-EVENT-v1.md`.
3. **Correção 5** (Particionamento) aplicada em `E3-CONTROL-CENTER-ARCHITECTURE.md`.
4. **Envelope v1:** adicionar `sourceSequence` (CRÍTICO).
5. **Workshop SOFIA+LÉO+Rafael:** validar semântica de projeções e reconciliação de gaps.

---

## HANDOFF OBJETIVO

### Para RAFAEL (Engenharia)

1. **Implementar `sourceSequence` no envelope v1** (mapear `mcf_events.sequence`).
2. **Implementar detecção de gaps** no ingest: se `sourceSequence` atual - `sourceSequence` anterior > 1 → alertar.
3. **Implementar regras de duplicate**: rejeitar `eventId` duplicado em `source_events`.
4. **Corrigir lógica de STALE**: `(receivedAt - occurredAt) > threshold`, não o inverso.
5. **Schema `source_events`:** adicionar coluna `source_sequence bigint not null`.

### Para MESTRE (Coordenação)

1. **Convocar workshop SOFIA+LÉO+Rafael** para:
   - Validar semântica de projeções MCF.
   - Definir política de reconciliação de gaps.
   - Aprovar estratégia de particionamento futuro.
2. **Gate E3:** não fechar até correções 1, 3, 4 e 5 aplicadas e workshop realizado.
3. **Próxima etapa:** E4 (Fundação Vercel + Supabase) pode iniciar em paralelo com implementação de correções.

---

## DECISÕES ARQUITETURAIS RATIFICADAS

1. **Ordering:** `sourceSequence` (copiado de `mcf_events.sequence`) é a única fonte de verdade para ordenação cronológica.
2. **Idempotency:** `eventId` (copiado de `mcf_events.id`) é a única chave de idempotência exposta ao Control Center.
3. **TTL:** `source_events` sem TTL (append-only auditável); `ingest_receipts` com 90 dias (configurável).
4. **Particionamento MVP:** índices apenas; particionamento futuro por `occurred_at` (não `mission_id`).
5. **LIVE/STALE/DEGRADED:** projeção é LIVE se referencia `eventId` verificável em `source_events` + latência < threshold.

---

**FIM DO PARECER ARQUITETURAL**

**SOFIA — 2026-09-02T23:05:19.396Z**