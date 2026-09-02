# Evidence provenance

- Mission: `MCF-CONTROL-CENTER-001`
- Stage: `E3`
- Agent preset: `mcf-rafael`
- DeepSeek Harness session: `session-8f281d3a-0a02-4003-9c64-0b1a495f8629`
- Provider: `nvidia-nim`
- Model: `deepseek-ai/deepseek-v4-flash-0731`
- Execution boundary: isolated review workspace `/tmp/mcf-control-center-e3` with source files mounted read-only by OS boundary
- Reviewed input SHA-256:
  - `E2-ARTIFACT-AUDIT.md`: `49f19c0a3dc01f52a5be1f0697e3dde4573df5b055812b52f481a43d1a9a5a62`
  - `E3-CONTROL-CENTER-ARCHITECTURE.md`: `892783008a49d68b7e1103afd4f5ced55243247f78f783034d2dc6d817a62b75`
  - `MCF-CONTROL-EVENT-v1.md`: `6ffff93d674384a001422a393e2cfa456ddded5d159db41911fe14de4646541c`
  - `SOFIA-E3-ARCHITECTURE-REVIEW.md`: `3b6c9c80a2268e862ce5b30863310c2136fd7ec076abcd036d86e9819dcd2408`
- Final step: `3`
- Final usage: `{"inputTokens": 20381, "outputTokens": 12986}`
- Observed task behavior: discovery + read-only inspection; no repository mutation or external action by the agent

---

Li e analisei os quatro arquivos. O contrato canônico referenciado em `docs/agentes/RAFAEL.md` não existe neste workspace (há apenas os 4 artefatos da E3), portanto me apoio no preset normativo MCF de Engenharia de Software. Evidência: nenhum arquivo foi criado/alterado/apagado; nenhuma ação externa executada — conforme imposto.

Sigo o formato exigido.

---

# MCF-CONTROL-CENTER-001 · E3

## VEREDITO DE ENGENHARIA

**E3_ENGINEERING_SPEC = VIÁVEL · CONDICIONAL AOS CONTRATOS ABAIXO**

A arquitetura proposta pela SOFIA é **estruturalmente correta e suficiente como direção**. Confirma-se que os dois artefatos de E2 têm destinos distintos e que o desenho ledger + projections, runtime outbound e Vercel/Supabase com PostgreSQL canônico preserva portabilidade. **Nenhum mecanismo ou decisão de SOFIA é rejeitado integralmente** — todos os 4 itens são válidos, mas **os itens 3 e 4 recebem refinamento técnico obrigatório** (não aceitação cega), e identifico **3 lacunas que a revisão da Sofia não cobriu** e que atendam bloqueio para a integração runtime→control.

O veredito é **condicional**: a transição E3→E4 só está liberada após o fechamento dos contratos na seção ESPECIFICAÇÃO PROPOSTA — que são **artefatos de contrato (documentos + DDL v1)**, não código de aplicação em execução.

**Autoridade preservada:** LEANDRO = autoridade humana final · MESTRE = orquestrador · LÉO = autoridade operacional delegada. Nada aqui altera esse contrato.

---

## VALIDAÇÃO DOS BLOCKERS DA SOFIA

### Resultado consolidado

| # | Item | Veredito | Fundamentação |
|---|------|----------|---------------|
| BLOCKER-01 | Payload schemas | **CONFIRMADO** (reforçado) | Necessário · aplicar policy de validação estrita |
| BLOCKER-02 | Schema Postgres | **CONFIRMADO** (reforçado) | Necessário · separar ledger imutável de rejections audit |
| CORREÇÃO-03 | Assinatura/autenticação | **CONFIRMADO + REFINADO** | HMAC correto, mas há erro de desenho no formato |
| CORREÇÃO-04 | Idempotência | **CONFIRMADO + REFINADO** | UUID v5 é arriscado; recomendar UUIDv7 + `ON CONFLICT` |

---

### BLOCKER-01 — Payload schemas MCF → **CONFIRMADO, reforçado**

**Sofia acerta.** Sem schema de `payload`, a regra "ingest falha fechada" (condição vinculante #4 do handoff) é insatisfazível: nada distingue evento válido de malformado, e projeções não têm contrato de campos.

**Refinamento que impede divergência de implementação (RAFAEL):**
1. **Envelope e payload devem ser separados de forma estrita e discriminada por `eventType`.** Os campos `missionId`, `phaseId`, `agentId`, `skillId`, `commitSha`, `missionVersion`, `evidenceRef` que hoje vivem no topo do envelope (v1 doc, linhas 16-24) são **majoritariamente específicos de evento** e devem migrar para o `payload`. Mantém-se no envelope apenas o que é **universal e de roteamento**: `schema`, `eventId`, `eventType`, `source`, `occurredAt`, e um `missionId` opcional de correlação. Isso evita um envelope "flat bag" com N campos nullable e força o discriminador no nível de validação.
2. **Validação por `oneOf` discriminado por `eventType`** com `additionalProperties: false` e `required` declarados por tipo. Campos ausentes ou extras ⇒ rejeição 400.
3. **TypeScript interface é a fonte de verdade canônica** (stack é TS); um **JSON Schema derivado** é gerado para validação server-side no `ingest` (ajv). Evita duplicação de fonte.
4. **Versionamento já previsto** (`mcf_control_event/v2` para quebra) confirma-se; qualquer campo novo em v1 é aditivo e opcional `?`, nunca destrutivo.

Especificação completa de interfaces na seção seguinte.

---

### BLOCKER-02 — Schema Postgres ausente → **CONFIRMADO, reforçado**

**Sofia acerta.** Nomes de tabela (arquitetura, linhas 46-69) sem DDL são improdutivos: migrations não existem, a regra LIVE (linhas 70-80) não é verificável sem as colunas de rastreabilidade, e o ER missions↔phases↔agents↔handoffs↔gates não está dado.

**Refinamentos de engenharia (não cobridos pela Sofia):**
1. **O ledger deve ter duas camadas de entrada, não uma.** A arquitetura pressupõe que `source_events` recebe eventos MCF **e** GitHub. Mantém-se isso, com `source` discriminando `mcf-runtime` | `github`. Mas **eventos rejeitados (assinatura/schema inválidos) NÃO devem entrar no ledger imutável** — iriam envenenar a projeção e violar "ledger imutável só contém o que aconteceu". Crio uma **tabela de auditoria de rejeições** separada (telemetria de segurança) e `ingest_receipts` referenciada apenas por eventos aceitos.
2. **`source_events` imutável: verificação via trigger preventing UPDATE/DELETE** — não só convenção. O "ledger é imutável" da condição vinculante #1 precisa ser garantido no banco, não só em regra de aplicação.
3. **Evento fora de ordem / correção:** projeções são materializadas por aplicação de eventos na ordem de `occurred_at`/sequência (ver nova lacuna L-1). DDL precisa guardar `id` de sequência ou apoiar re-aplicação.
4. **`verification_state`** precisa de semântica fechada (ver ESPECIFICAÇÃO).

DDL completo na seção seguinte.

---

### CORREÇÃO-03 — Assinatura/autenticação → **CONFIRMADO + REFINADO**

**Sofia acerta** que não há mecanismo concreto e que HMAC-SHA256 é a escolha correta (server-to-server, shared secret, como o próprio GitHub usa para webhooks). **Porém há um erro de desenho no formato proposto que deve ser corrigido agora:**

1. **Nunca assinar "corpo canônico".** Canonicalização de JSON (ordenar chaves, normalizar whitespace) é fonte clássica de bug de comunicação produtiva — emissor e receptor geram bytes diferentes e o evento é rejeitado. **Assina-se os bytes exatos recebidos/emitidos do body.** O receptor valida HMAC sobre o **raw body** exatamente como chega.
2. **Formato do header (refinado):** `X-MCF-Signature: <timestamp>.<keyId>.<sha256hex>` calculado sobre o string `timestamp + "." + body`. O componente `keyId` habilita **rotação de secret sem downtime** (rotação é condição vinculante implícita da SOFIA). Compartilha-se o secret com prefixo `mcf_` e rotação via `supabase` env versionada.
3. **Replay protection real:** timestamp + janela `±300s` **e** nonce/eventId já verificados (idempotência). Ordem: (1) assinatura válida → (2) timestamp na janela → (3) eventId novo (idempotência). Os três juntos bloqueiam replay.
4. **Comparação timing-safe** (`crypto.timingSafeEqual`), nunca `==`.
5. **Secrets separados por fonte:** secret do MCF runtime ≠ secret do webhook GitHub (GitHub usa `X-Hub-Signature-256` nativo). Não reutilizar segredo entre fontes.
6. A recomendação da SOFIA (HMAC + X-MCF-Signature/Timestamp) é **aceita**; o formato específico é o refinamento acima.

---

### CORREÇÃO-04 — Idempotência → **CONFIRMADO + REFINADO**

**Sofia acerta** que idempotência precisa de formato, detecção e resposta HTTP definidos. **Refino a recomendação de `eventId`:**

- **UUID v5 determinístico (sugerido pela Sofia) tem risco real:** dois eventos legítimos que compartilhem `(missionId, eventType, occurredAt, nonce)` colidem no mesmo id → um é silenciosamente descartado. `occurredAt` com granularidade de ms está propenso a igualdade em rajadas. Para um **event ledger correto, cada evento é uma ocorrência distinta** e deve ter identidade única.
- **Recomendo `eventId = UUIDv7`** (monotônico, orderável no tempo, colisão essencialmente nula) gerado pelo **runtime no momento do evento**. A detecção de duplicata NÃO se baseia em determinismo do id, e sim no **constraint único + UPSERT idempotente**:
  - `source_events(event_id UUID PRIMARY KEY)`.
  - Inserção via `INSERT ... ON CONFLICT (event_id) DO NOTHING RETURNING`.
  - Novo ⇒ `201 Created` + novo receipt · Duplicata ⇒ `200 OK` + **receipt existente** (mesmo `id`).

Isso atende integralmente o critério de aceite da Sofia (enviar 2× ⇒ 1 linha + mesmo receipt) sem o risco de supressão de evento legítimo do UUID v5. Mantém-se um nonce no payload apenas quando o runtime precisa distinguir duas ocorrências rápidas do mesmo tipo/at.

---

## ESPECIFICAÇÃO PROPOSTA

### 0. Envelope normalizado (v1, refinado)

```ts
interface ControlEventEnvelopeV1 {
  schema: "mcf_control_event/v1";
  eventId: string;            // UUIDv7 (gerado no runtime no momento do evento)
  eventType: ControlEventType;
  source: "mcf-runtime";      // destino de /api/ingest/mcf
  occurredAt: string;         // ISO8601 UTC, do runtime (origem)
  missionId?: string;         // UUID de correlação universal (opcional)
  payload: Record<string, unknown>; // validado por oneOf discriminado por eventType
}
```
`receivedAt` é acrescentado pelo Control Center (não vem do runtime). Nada de `LEANDRO` serializado como agente técnico. HUMAN_GATE preserva proveniência de autoridade sem expor dados de autenticação.

### 1. Payload schemas — eventos críticos (BLOCKER-01)

Fonte de verdade: TypeScript interface; JSON Schema derivado para validação no ingest.

```ts
type MissionState = "CREATED"|"ACTIVE"|"BLOCKED"|"COMPLETED"|"ABANDONED";
type GateType = "TECHNICAL"|"ARCHITECTURE"|"SECURITY"|"CONTINUITY"|"FINAL";
type GateAuthority = "HUMAN"|"MESTRE"|"LEO"|"AUTOMATED";
type VerificationResult = "PASS"|"FAIL"|"PARTIAL";
type VerificationState = "UNVERIFIED"|"VERIFIED"|"REJECTED"|"SOURCE_UNAVAILABLE";

interface MISSION_CREATED {
  missionCode: string;          // ex "MCF-CONTROL-CENTER-001" (unique)
  name: string;
  objective: string;
  description?: string;
  repository?: string;          // "owner/repo" full_name
  leadAgent?: string;           // ex "MESTRE"
}
interface MISSION_STATE_CHANGED {
  fromState: MissionState;
  toState: MissionState;
  reason: string;
}
interface PHASE_STARTED {
  phaseCode: string;
  phaseName: string;
  startedAt: string;            // ISO8601
  inputArtifacts?: string[];
}
interface PHASE_COMPLETED {
  phaseCode: string;
  phaseName: string;
  completedAt: string;
  durationMs: number;
  outputArtifacts: string[];    // refs a receipts/evidence
  resultsNote?: string;
}
interface HANDOFF_CREATED {
  fromAgent: string;
  toAgent: string;
  context: string;
  artifacts: string[];          // refs
  command?: string;             // instrução operacional compacta
}
interface GATE_OPENED {
  gateType: GateType;
  openedBy: string;
  openedAt: string;
  criteria: string[];
  request: string;
}
interface GATE_RESOLVED {
  gateType: GateType;
  resolvedBy: string;
  decision: "OPEN"|"CLOSE"|"DEFER";
  resolvedAt: string;
  evidenceRefs: string[];
  authority: GateAuthority;
  reason: string;
}
interface EVIDENCE_ACCEPTED {
  evidenceType: string;         // "test-result"|"artifact-sha"|"receipt"|...
  provider: string;             // agente produtor
  verificationResult: VerificationResult;
  verificationState: VerificationState;
  refUri?: string;
  hashSha256?: string;
}
interface EVIDENCE_REJECTED extends Omit<EVIDENCE_ACCEPTED,"verificationResult"> {
  reason: string;               // obrigatório no REJECTED
}
```

Regra de validação: `oneOf` por `eventType`, `additionalProperties:false`, campos `required` por tipo. `PHASE_STARTED`/`COMPLETED`, `GATE_OPENED`/`RESOLVED`, `EVIDENCE_ACCEPTED`/`REJECTED` são pares semanticamente unidos — validação deve garantir que um tipo do par completo exista (fases abrem e fecham; gates abrem e resolvem). Eventos RUNTIME_HEALTH_CHANGED e AGENT_ASSIGNED também entram na spec (mesma disciplina) mas não são gate de bloqueio para E4 se ficarem além do mínimo crítico — incluo todos para evitar nova revisão.

### 2. Schema / DDL lógico inicial (BLOCKER-02)

**Ledger (append-only):**

```sql
CREATE TABLE source_events (
  event_id    UUID PRIMARY KEY,          -- UUIDv7, identidade de negócio
  source      TEXT NOT NULL CHECK (source IN ('mcf-runtime','github')),
  event_type  TEXT NOT NULL,
  schema_version TEXT NOT NULL DEFAULT 'mcf_control_event/v1',
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  mission_id  UUID,
  event_payload JSONB NOT NULL,
  raw_body    BYTEA,                      -- bytes canônicos p/ re-verif. assinatura e auditoria
  signature   TEXT,
  signature_key_id TEXT
);
CREATE INDEX idx_src_events_source_occ ON source_events(source, occurred_at);
CREATE INDEX idx_src_events_mission   ON source_events(mission_id);
-- Garantia de imutabilidade no banco:
CREATE OR REPLACE FUNCTION forbid_source_events_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'source_events is append-only'; END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_source_events_no_update BEFORE UPDATE OR DELETE ON source_events
  FOR EACH ROW EXECUTE FUNCTION forbid_source_events_mutation();
```

```sql
CREATE TABLE ingest_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL UNIQUE REFERENCES source_events(event_id),
  status   TEXT NOT NULL CHECK (status IN ('ACCEPTED','REJECTED')),
  http_status INT NOT NULL,
  signature_valid BOOLEAN,
  timestamp_within_window BOOLEAN,
  rejection_reason TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Auditoria de segurança p/ entradas rejeitadas (envenenam o ledger se persistidas nele):
CREATE TABLE ingest_rejections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stage TEXT NOT NULL,                 -- 'signature'|'timestamp'|'schema'|'duplicate-check-failure'
  reason TEXT NOT NULL,
  event_type TEXT,
  occurred_at TIMESTAMPTZ,
  received_ip TEXT,
  payload_hash TEXT
);
```

**Projeções (todas com colunas-base de rastreabilidade LIVE):** `source TEXT`, `source_event_id UUID REFERENCES source_events(event_id)`, `occurred_at TIMESTAMPTZ`, `received_at TIMESTAMPTZ`, `verification_state TEXT DEFAULT 'VERIFIED'` (valor de `VerificationState`).

```sql
CREATE TABLE missions (
  id UUID PRIMARY KEY,
  mission_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  repository TEXT, objective TEXT, lead_agent TEXT, commit_sha TEXT,
  created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
  source, source_event_id, occurred_at, received_at, verification_state
);
CREATE TABLE mission_phases (
  id UUID PRIMARY KEY,
  mission_id UUID NOT NULL REFERENCES missions(id),
  phase_code TEXT NOT NULL, phase_name TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'NOT_STARTED',
  started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, duration_ms BIGINT,
  output_artifacts JSONB,
  source_event_id, ... ,
  UNIQUE (mission_id, phase_code)
);
CREATE TABLE agents (
  id TEXT PRIMARY KEY,                 -- key de preset: 'MESTRE','LEANDRO','RAFAEL',...
  name TEXT NOT NULL, role TEXT, status TEXT,
  last_seen_at TIMESTAMPTZ, source_event_id, ...
);
CREATE TABLE skills (
  id TEXT PRIMARY KEY,                 -- 'MCF-START-MISSION',...
  name TEXT NOT NULL, description TEXT, version TEXT, source_event_id, ...
);
CREATE TABLE mission_assignments (
  id UUID PRIMARY KEY,
  mission_id UUID NOT NULL REFERENCES missions(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  skill_id TEXT REFERENCES skills(id),
  role TEXT, granted_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  source_event_id, ...,
  UNIQUE (mission_id, agent_id, skill_id)
);
CREATE TABLE handoffs (
  id UUID PRIMARY KEY,
  mission_id UUID NOT NULL REFERENCES missions(id),
  phase_id UUID REFERENCES mission_phases(id),
  from_agent TEXT NOT NULL REFERENCES agents(id),
  to_agent TEXT NOT NULL REFERENCES agents(id),
  context TEXT, artifacts JSONB, command TEXT,
  created_at TIMESTAMPTZ NOT NULL, source_event_id, ...
);
CREATE TABLE gates (
  id UUID PRIMARY KEY,
  mission_id UUID NOT NULL REFERENCES missions(id),
  phase_id UUID REFERENCES mission_phases(id),
  gate_type TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'OPEN',
  opened_by TEXT, opened_at TIMESTAMPTZ,
  resolved_by TEXT, decision TEXT, resolved_at TIMESTAMPTZ,
  authority TEXT, reason TEXT,
  criteria JSONB, evidence_refs JSONB, source_event_id, ...
);
CREATE TABLE evidence_receipts (
  id UUID PRIMARY KEY,
  mission_id UUID REFERENCES missions(id),
  provider TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  verification_result TEXT NOT NULL,
  verification_state TEXT NOT NULL,
  reason TEXT, ref_uri TEXT, hash_sha256 TEXT,
  accepted_at TIMESTAMPTZ, source_event_id, ...
);
CREATE TABLE runtime_snapshots (
  id UUID PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id),
  status TEXT NOT NULL, schema_version TEXT, payload JSONB,
  captured_at TIMESTAMPTZ NOT NULL, source_event_id, ...
);
```

**Projeções GitHub** (contêm o discriminador que corrige GITPULSE-01 no storage — não no frontend):

```sql
CREATE TABLE github_repositories (
  id BIGINT PRIMARY KEY, full_name TEXT UNIQUE NOT NULL,
  owner TEXT NOT NULL, description TEXT, default_branch TEXT,
  html_url TEXT, updated_at TIMESTAMPTZ, source_event_id, ...
);
CREATE TABLE github_pull_requests (
  id BIGINT PRIMARY KEY,
  repository_id BIGINT NOT NULL REFERENCES github_repositories(id),
  number INT NOT NULL, title TEXT, state TEXT,
  head_sha TEXT, base_sha TEXT,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
  source_event_id, ..., UNIQUE (repository_id, number)
);
CREATE TABLE github_issues (
  id BIGINT PRIMARY KEY,
  repository_id BIGINT NOT NULL REFERENCES github_repositories(id),
  number INT NOT NULL, title TEXT, state TEXT,
  is_pr BOOLEAN NOT NULL DEFAULT false,   -- discrimina issue real de PR (corrige GITPULSE-01)
  html_url TEXT, created_at TIMESTAMPTZ, closed_at TIMESTAMPTZ,
  source_event_id, ..., UNIQUE (repository_id, number)
);
CREATE TABLE github_releases (
  id BIGINT PRIMARY KEY, repository_id BIGINT REFERENCES github_repositories(id),
  tag_name TEXT NOT NULL UNIQUE, name TEXT, published_at TIMESTAMPTZ,
  source_event_id, ...
);
CREATE TABLE github_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id BIGINT REFERENCES github_repositories(id),
  event_type TEXT NOT NULL, actor TEXT, payload JSONB,
  occurred_at TIMESTAMPTZ NOT NULL, source_event_id, ...,
  UNIQUE (source_event_id)
);
```

**ER (relações críticas):** `missions 1—N mission_phases` · `missions N—N agents via mission_assignments` (com `agents`,`skills`) · `mission_phases 0—1 handoffs` · `mission_phases 0—N gates` · `missions 1—N evidence_receipts`. Todas as projeções apontam `source_event_id → source_events(event_id)` (derivação/reconstrução a partir do ledger). Nada de UPDATE/DELETE em `source_events`.

### 3. Assinatura e replay (CORREÇÃO-03, refinada)

- Mecanismo: **HMAC-SHA256** sobre string `timestamp + "." + raw_body`.
- Header: `X-MCF-Signature: <timestamp>.<keyId>.<hex>`.
- Validação no `/api/ingest/mcf` antes de persistir, nesta ordem: (1) header presente e bem-formado; (2) HMAC valida (timing-safe); (3) `|now - timestamp| ≤ 300s`; (4) `eventId` novo (idempotência). Falha em qualquer ⇒ `ingest_rejections` + 4xx; nada no ledger.
- Rotação: secret versionado por `keyId` em env server-side; múltiplos `keyId` aceitos durante período de rotação (grace). Secrets por fonte (MCF ≠ GitHub).

### 4. Idempotência (CORREÇÃO-04, refinada)

- `eventId` = **UUIDv7** gerado no runtime no momento do evento.
- Detecção: `source_events.event_id` PRIMARY KEY + `INSERT ... ON CONFLICT (event_id) DO NOTHING RETURNING`.
- Resposta: novo ⇒ `201 Created` (novo receipt) · duplicata ⇒ `200 OK` (receipt existente, mesmo `id`). Repetição enésima retorna o mesmo receipt.
- Network retry do runtime não corrompe nem rejeita; é idempotente por construção.

### 5. Projeções e reconstrução (fecho da condição vinculante #2)

- Projeções são **derivadas**: materialização a partir de `source_events` aplicados em ordem de `occurred_at`/sequência. Inconsistência ⇒ reconstrução da projeção a partir do ledger (procedimento documentado em E4, não script hoje).
- **L-1 (lacuna nova): ordenação/eventos fora de ordem.** Garantir que o ingest não aplica estado passado por cima de estado mais recente — projeção deve guardar a última sequência/`occurred_at` aplicada por agregação e **ignorar eventos fora de ordem** (logando os recebidos tardios para auditoria), ou aplicar por version-guard. A proposta v1 não prevê isso; **só funciona em runtime de fluxo estritamente sequencial**, o que não é garantido.
- **L-2 (lacuna nova): concorrência/`missionVersion`.** O envelope original carrega `missionVersion`. Definir política: UPDATE otimista com `version` — projeção só avança se `event.version == current.version + 1` (ou `≥` com merge), senão rejeita evento com 409 auditado. Evita perda de atualização quando dois eventos concorrentes da mesma missão chegam próximos. Sem isso, "último que chega vence" corrompe ordem.

### 6. Regra LIVE (fecho da condição vinculante #3)

Todo campo marcado LIVE se resolve por `(source, source_event_id, occurred_at, received_at, verification_state)`. Se `verification_state = 'SOURCE_UNAVAILABLE'` ou a origem não responder, UI exibe `STALE`/`DEGRADED`/`UNKNOWN`, **nunca simula LIVE**. `verification_state` semântica: `VERIFIED` (evento aceito e projeção consistente) · `UNVERIFIED` (aceito, verificação pendente) · `REJECTED` (contra-evidência) · `SOURCE_UNAVAILABLE` (origem indisponível).

---

## FRONTEIRA E3 → E4

O objetivo desta E3 é **produzir contratos**, não código. Separo com rigor para não transformar planejamento em implementação prematura.

### DEVE EXISTIR ANTES da E4 (antes de qualquer criação de Vercel/Supabase) — contratos, fechados e commitados

1. `MCF-CONTROL-EVENT-v1` atualizado **ou** novo `MCF-EVENT-PAYLOADS-v1` com as interfaces da seção 1 (BLOCKER-01).
2. **DDL v1** (`db/migrations/0001_initial_schema.sql`) da seção 2 + **diagrama ER** text/mermaid (BLOCKER-02).
3. **Spec de assinatura/replay** (seção 3) versionada (CORREÇÃO-03).
4. **Spec de idempotência** (seção 4) versionada (CORREÇÃO-04).
5. **Spec de projeção/ordenação/concorrência** (seção 5, lacunas L-1/L-2) versionada.
6. `.env.example` com todas as variáveis, sem valores reais.
7. **Gate LÉO** sobre estes contratos + handoff assinado.

Estes são **artefatos de contrato** (docs + SQL versionado), não execução de infra. Criar Vercel/Supabase, aplicar migration, rodar o código é **E4**.

### PODE SER IMPLEMENTADO DENTRO da E4 (não agora)

- Criação dos projetos Vercel + Supabase e aplicação da migration.
- Implementação do `/api/ingest/mcf` (validação schema + assinatura + idempotência + persistência + projecção).
- UI shell renderizando projeções com rastreabilidade LIVE.
- Integração GitHub server-side (token autenticado), webhook, correção de GITPULSE-01/02/03/04.
- Realtime (fase própria, com polling fallback desde o primeiro dia).
- Auth/RLS e escrita/commandos permanecem **fora de E4** (gate de fase futura, auditoria de segurança antes de habilitar escrita).

---

## RISCOS E TESTES

### Gatilhos de risco herdados + refinados

| Risco | Sev. | Mitigação de engenharia |
|---|---|---|
| Eventos fora de ordem corrompem projeção (L-1) | **ALTA** | version/sequência guard; eventos tardios logados, não aplicados sobre estado mais novo |
| Perda de atualização por concorrência (L-2) | MÉDIA | `missionVersion` + UPDATE otimista; rejeição 409 auditada |
| Header/rotação de secret divergem entre runtime e CC | ALTA | contract versionado do formato `ts.keyId.hex` + testes unitários; segredos por fonte rotáveis com `keyId` |
| Suprema supressão de eventos (risco da recomendação UUID v5) | MÉDIA | UUIDv7 + `ON CONFLICT DO NOTHING`; teste de duplicata |
| Replay forjado | ALTA | HMAC + janela ±300s + idempotência; ordem de validação fixa |
| Realtime/multi-aba no tier gratuito | BAIXA | polling fallback primário-adjacente; monitorar uso |
| GitHub rate limit (GITPULSE-04) | MÉDIA | token/PAT server-side (5k/h), nunca frontend |
| Migração VPS (Realtime Elixir, failover, SSL, CI/CD) | BAIXA | não-bloqueador; documentar dependências Supabase-specific; adaptador de realtime isolado (interface) |
| Segurança antes de comandos | ALTA | auditoria externa (Emily) + handoff de segurança (Ricardo) antes de qualquer escrita |

### Matriz de testes exigida

1. Assinatura válida ⇒ `201` + recebimento em `source_events`/`ingest_receipts`.
2. Assinatura inválida/ausente ⇒ 401, item em `ingest_rejections`, 0 linhas no ledger.
3. Timestamp fora da janela ⇒ 4xx, rejeitado (replay), não persistido.
4. Mesmo `eventId` enviado 2× ⇒ 1 linha no ledger, mesmo receipt, `200` na 2ª.
5. Evento malformado (schema) ⇒ 400, rejeição auditada.
6. Evento fora de ordem/versão antiga ⇒ não sobreescreve estado atual; logado.
7. UPDATE/DELETE em `source_events` ⇒ trigger rejeita (verificação de imutabilidade no banco).
8. UI: projeção renderiza com `source`, `event_id`, `occurred_at`, `received_at`, `verification_state` auditáveis; origem indisponível ⇒ `STALE`/`UNKNOWN` (não LIVE).
9. Realtime ou polling propaga mudança sem refresh manual.
10. GITPULSE-01/02: issue vs PR discriminado (is_pr) e card Commits não mostra watchers.

---

## HANDOFF PARA RICARDO

**De:** RAFAEL (Engenharia de Software) · **Para:** RICARDO (Segurança) · **Missão:** MCF-CONTROL-CENTER-001 · **Transição:** E3 → E4

**Escopo do review requerido: os controles de segurança a seguir. Nada disso é autorização de escrita/ação externa — é checklist de revisão antes de integração runtime→control em ambiente não-local e, obrigatoriamente, antes de habilitar qualquer endpoint de comando.**

1. **Esquema criptográfico de ingest:** validar HMAC-SHA256 sobre `ts + "." + raw_body`, formato `X-MCF-Signature: ts.keyId.hex`, comparação timing-safe, e separação de segredos por fonte (MCF runtime ≠ GitHub webhook) — confirmação de que a validação ocorre antes de qualquer persistência e que `raw_body` é preservado para re-verificação forense.
2. **Key management e rotação:** modelo de `keyId` versionado em env server-side, rotação com grace sem downtime, ausência de qualquer secret commitado (checklist de scan), `.env.example` sem valores.
3. **Replay protection:** janela ±300s + idempotência `eventId` — validar que os três controles são independentes e que falha em qualquer um fecha o ingest.
4. **Modelo de ameaças do endpoint público:** `/api/ingest/mcf` exposto publicamente; validar rate limiting, limites de tamanho de body, e que rejeições geram `ingest_rejections` (telemetria de abuso) sem liberar detalhes internos de stack nas respostas.
5. **Imutabilidade e integridade do ledger:** confirmação do trigger anti-UPDATE/DELETE em `source_events` e hash/`raw_body` para detecção de adulteração.
6. **Token/credencial GitHub:** uso de token autenticado exclusivamente server-side; nenhuma credencial exposta ao browser; escopo mínimo do token.
7. **Postgres hardening / RLS:** princípio de least-privilege nas credenciais do app; fundações de RLS definidas desde já (mesmo em fase read-only pública) para que dados operacionais do MCF nunca fiquem expostos sem sessão.
8. **Realtime seguro:** canais Realtime não devem vazar dados operacionais MCF em deployment público; apenas dados GitHub públicos antes de auth; aplicação de RLS nos channels.
9. **Preparação para escrita futura:** recomendação de que todo endpoint de comando atravesse o boundary governado do MCF com receipt verificável, e que a **auditoria independente de segurança seja condição bloqueante** antes de habilitá-los.

---

**Status E3:** VIÁVEL · CONDICIONAL — aguardando concordância com os refinamentos (UUIDv7, assinatura de raw bytes com rotação `keyId`, ledger imutável com trigger, camada de rejeição separada, e lacunas L-1 relevando ordenação + L-2 concorrência/`missionVersion`).
**Retorno a:** MESTRE (para atualizar os contratos sob its autoridade) e LÉO (gate de continuidade sobre esses contratos).
**Próximo:** E4 — após contratos fechados e revisão RICARDO das seções acima.

**RAFAEL · Engenharia de Software · MCF** — saída de revisão somente leitura; nenhum arquivo criado/alterado/excluído; nenhuma ação externa executada.
