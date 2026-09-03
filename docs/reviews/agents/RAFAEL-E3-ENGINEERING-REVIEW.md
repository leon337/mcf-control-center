Artefatos canônicos e de revisão lidos (contrato `agents/RAFAEL.md`, arquitetura `source/E3-CONTROL-CENTER-ARCHITECTURE.md`, contrato de evento `source/MCF-CONTROL-EVENT-v1.md` e o parecer `handoff/SOFIA-E3-ARCHITECTURE-REVIEW.md`). Executo a revisão crítica conforme método mínimo do meu contrato: valido objetivo/escopo, confiro fontes, não aceito automaticamente o parecer da SOFIA, e proponho correções concretas sem alterar arquivos — somente leitura, conforme missão.

---

# VEREDITO DE IMPLEMENTABILIDADE — MCF-CONTROL-CENTER-001 / E3→E4

**Revisão:** RAFAEL — Engenharia de Software. **Natureza:** análise crítica, sem escrita em arquivos, sem ação externa.

## 1. VEREDITO DE IMPLEMENTABILIDADE

**IMPLEMENTÁVEL — COM BLOQUEIOS REAIS A RESOLVER ANTES DA E4, e com CORREÇÃO OBRIGATÓRIA ao esquema de assinatura proposto pela SOFIA.**

A estrutura de alto nível (event ledger + projections, push model outbound, read-only first, portabilidade) é sólida e implementável como está planejada. Porém:

- **BLOCKER-1 CONFIRMADO**, mas a correção sugerida pela SOFIA **NÃO é suficiente** — há uma falha de segredo-forte no esquema HMAC que precisa ser corrigida (ver §4). Isso impede implementação segura do `/api/ingest/mcf`.
- **BLOCKER-2 CONFIRMADO**, com refinamentos concretos: falta `raw_body` para re-verificação de assinatura, falta `ingest_receipts`, falta mecanismo de *append-only* efetivo, e regra contra *drift* entre colunas promovidas e `payload` (ver §5).
- **Nota de reclassificação:** nenhum não-blocker da SOFIA vira blocker; ao contrário, **rebaixo** a recomendação de "assinatura opcional para eventos públicos" para **rejeitada** (decisão de segurança), e reafirmo BLOCKER-1/2 como os únicos gates de E4.

Recomendo **não iniciar a integração do MCF Runtime** (`/api/ingest/mcf` e projeções MCF) antes de BLOCKER-1/2 serem especificados no contrato. A trilha **GitHub-first** pode começar em paralelo, pois não depende desses blockers.

---

## 2. CONCORDÂNCIAS E DIVERGÊNCIAS COM SOFIA

Classificação usada: **[ARQ]** decisão de arquitetura · **[ENG]** detalhe de engenharia · **[HIP]** hipótese não verificada.

### Concordâncias (asserto): aceito
| # | Item | Classe | Comentário técnico meu |
|---|------|--------|--------------------------|
| A1 | Ledger + projections (CQRS/ES) | [ARQ] | Correto; projeções reconstruíveis a partir do ledger = mecanismo natural de rollback (ver §7). |
| A2 | Push model (runtime → CC) | [ARQ] | Evita abrir porta de entrada; correto. |
| A3 | Portabilidade Vercel+Supabase→VPS | [ARQ] | Correto; sem lock-in. |
| A4 | Regra LIVE + degradação STALE/DEGRADED | [ARQ] | Correto e honesto; nenhum LIVE fabricado. |
| A5 | Read-only first, comandos depois | [ARQ] | Correto; impede simulação de estado. |
| A6 | `source_events` **unificado** por `source` (github + mcf-runtime) | [ARQ] | Endosso: mesmo ledger é preferível a dois ledgers; o que separa é a camada de leitura/projeção. |

### Divergências / correções (asserções técnicas com fundamento)
| # | Sobre | Classe | Minha posição |
|---|--------|------|----------------|
| D1 | **BLOCKER-1**: SOFIA sugere HMAC sobre subconjunto `eventId\|occurredAt\|eventType\|missionId` | [ENG]/segurança | **Rejeito como insuficiente.** O subconjunto **não cobre `payload`, `phaseId`, `commitSha`, `evidenceRef` etc.** Um MITM poderia mutar `payload`/`commitSha` mantendo assinatura válida. O HMAC deve recobrir **o corpo bruto inteiro** (ver §4). |
| D2 | **BLOCKER-1**: usar `occurredAt` vs `receivedAt` para janela de replay | [ENG] | **Corrijo.** `occurredAt` é timestamp de negócio da origem e sujeito a skew de relógio; replay deve usar um `timestamp`/nonce da camada de transporte, calculado no receptor contra o relógio local, e coberto por assinatura (ver §4). |
| D3 | **BLOCKER-1**: "eventTypes sensíveis DEVEM ser assinados vs públicos opcionais" | [ENG]/segurança | **Rejeito o caminho opcional no v1.** Criar dois caminhos na ingest = superfície de confusão/abuso e um caminho para injetar dados MCF "não assinados" como públicos. Assinam-se **todos**; sensibilidade é resolvida na leitura/auth, não na assinatura. |
| D4 | NÃO-BLOCKER-1 | [ARQ] | Concordo que não bloqueia o **início** de E4, mas é **dependência de sequência** para a trilha MCF: `/api/ingest/mcf` só é integrável após alinhar `missions/gates/handoffs` para não divergir do domínio do runtime (acoplamento §4.4 da SOFIA). |
| D5 | Recomendação de workshop SOFIA+LÉO+Rafael sobre semântica de eventos MCF | [ARQ] | Endosso forte; é pré-requisito de correta implementação das projeções MCF, não só conforto. |
| D6 | NÃO-BLOCKER-2 (preservar GitPulse) — falta contrato | [ENG] | Adoto **Opção A** (tag + branch congelada) como obrigatória **antes** de qualquer mutação, e Opção B (feature flag) como boa prática adicional. |
| D7 | Idempotência de GitHub: SOFIA cobriu mapeamento, mas sem definir a chave | [ENG] | Correção: idempotência GitHub = header **`X-GitHub-Delivery`** (UUID por delivery), não derivado de campos do evento (um `push` não tem id estável por si). |
| D8 | `ingest_receipts`: SOFIA lista a tabela mas **não a especifica** | [ENG] | Gap real de BLOCKER-2; proponho schema em §5. |

### Hipóteses declaradas (não são decisão)
- **[HIP]** Explosão de volume (~1 GB / 1M eventos de JSONB) e consequente necessidade de particionamento/TTL — **não verificado**; decido monitorar 3 meses e decidir TTL com LÉO.
- **[HIP]** Necessidade futura de fila durável entre webhook e ingest em rajadas do GitHub — escalabilidade futura, não gate de E4.

---

## 3. BLOCKERS CONFIRMADOS / RECLASSIFICADOS

| Blocker | Status | Verdicto | Decisão |
|---------|--------|----------|---------|
| **BLOCKER-1** — assinatura/replay ausente | **CONFIRMADO** | A correção da SOFIA é insuficiente (D1–D3); exige redação revisada no contrato (§4) antes de implementar `/api/ingest/mcf`. | GATE de E4. |
| **BLOCKER-2** — schema de `source_events` ausente | **CONFIRMADO** | Base da SOFIA aceitável, mas precisa de `raw_body`, enum de status de assinatura, `ingest_receipts`, enforcement de append-only e regra anti-drift (§5). | GATE de E4. |

### Reclassificações frente ao parecer da SOFIA
- **NÃO-BLOCKER-1 (projeções MCF):** mantém-se não-blocker para **início**, mas é **pré-requisito de sequência** da integração MCF. Não elevo a blocker porque a trilha GitHub-first desbloqueia E4 imediatamente.
- **Recomendação "assinatura opcional p/ eventos públicos" (parte do BLOCKER-1):** **rebaixo/rejeito** — não deve existir no v1 (D3).
- **NÃO-BLOCKER-2/3/4/5:** mantidos como não-blocker; NÃO-BLOCKER-2 (baseline) passa a **pré-requisito de ordem de implementação** (tag antes de qualquer mutação), sem virar gate.

---

## 4. PROPOSTA TÉCNICA PARA BLOCKER-1 (assinatura/replay)

**Artefato que referencia:** `MCF-CONTROL-EVENT-v1.md` → adicionar seção "Autenticação e Assinatura". Especifico abaixo o que SOFIA/MESTRE devem aprovar e o que eu implemento.

### 4.1 Algoritmo ([ENG])
- **HMAC-SHA256** com secret compartilhado via env `MCF_RUNTIME_SIGNING_SECRET` (curto prazo, 1 emissor). [ARQ] OBS: Ed25519 seria melhor p/ não-repúdio por-ator quando houver vários runtimes/agentes assinando; **registrar como evolução**, não para v1.
- **Material assinado = timestamp de transporte + corpo bruto inteiro** (bytes exatos recebidos, sem re-serializar):
  ```
  MAC = HMAC-SHA256( secret, "t=<epoch_ms>\n" + rawBody )
  ```
  Cobrir o corpo bruto inteiro elimina o gap de não-cobertura de `payload`/`commitSha`/`phaseId`/`evidenceRef` (correção D1) e elimina erro de canonicalização entre implementações (nada de strings com `|` concatenados).
- Header: `X-MCF-Signature: t=<epoch_ms>,v1=<hex>`.

### 4.2 Replay ([ENG])
- **Janela anti-replay baseada no `t` do transporte, não em `occurredAt`:** o receptor calcula `|now() - t| <= 5min` contra o relógio local (evita skew, correção D2). `occurredAt` permanece timestamp de negócio e NÃO é usado para replay.
- **Idempotência = linha do ledger:** `event_id` UNIQUE já persiste. Replay de evento já entregue → retorna **receipt anterior** (`200/202` com recebido anterior), sem nova linha. A janela de 5 min limita o vencimento de envelopes capturados ainda não entregues.
- **Nonce opcional** (`replay_nonce` no `payload` ou global) para endpoints que não tenham `event_id`; não exigido para v1.

### 4.3 Async vs. requisito de assinatura ([ENG])
- **Todos os `eventType` devem ser assinados no v1.** Remover o caminho "público opcional" (D3). Sensibilidade (público GitHub vs. operacional MCF) é decidida na camada de leitura/auth, não na ingest.

### 4.4 Rotação de chaves ([ENG])
- Envs: `MCF_RUNTIME_SIGNING_SECRET` (atual) + `MCF_RUNTIME_SIGNING_SECRET_PREVIOUS` (sobreposição).
- Validação tenta `current` e, em falha, `previous`; durante janela de rotação ambos aceitos; erro 401 quando ambos falham.
- Sem valor hardcoded; commit só de `.env.example` com placeholders.

### 4.5 Semântica HTTP do `/api/ingest/mcf` ([ENG] — preencher 5.1 da SOFIA)
| Caso | Resposta |
|------|----------|
| Aceito | `202` + corpo `{ ingestReceiptId, status: "accepted" }` |
| Duplicado (`event_id` já persistido) | `200` + corpo com receipt anterior, `status: "already_received"` → **no-op idempotente** (não é erro) |
| Assinatura inválida/expirada | `401` |
| Schema inválido / campo ausente | `400` |
| Versão/schema desconhecido | `422` |
| Rate-limit | `429` (`Retry-After`) |

### 4.6 Adverse/opcional (para auditoria da Emily)
- Persistir `raw_body` (bytes), `received_at`, `t` e resultado da verificação para **re-verificação offline** (detalhe de §5) — assim Emily audita sem acesso ao segredo em runtime.

---

## 5. PROPOSTA TÉCNICA PARA BLOCKER-2 (ledger/schema)

**Artefatos que referencia:** `E3-CONTROL-CENTER-ARCHITECTURE.md` linha 49 e `MCF-CONTROL-EVENT-v1.md`. Mantenho a base da SOFIA e aplico correções.

### 5.1 `source_events` (migration versionada em `supabase/migrations/001_*.sql`) ([ENG])
```sql
CREATE TABLE source_events (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, -- p/ particionamento futuro
  event_id         TEXT NOT NULL UNIQUE,        -- idempotência, texto (aceita UUID p/ MCF e github-purl p/ GitHub)
  event_type       TEXT NOT NULL,               -- mcf:*:MISSION_STARTED | github:pull_request.opened
  source           TEXT NOT NULL CHECK (source IN ('mcf-runtime','github')),
  occurred_at      TIMESTAMPTZ NOT NULL,        -- timestamp de negócio da origem
  received_at      TIMESTAMPTZ NOT NULL DEFAULT now(), -- preenchido NO SEGUIDOR, nunca pelo cliente
  mission_id       UUID,                        -- coluna PROMOVIDA p/ consulta (derivada em ingest)
  body             JSONB NOT NULL,              -- envelope JSON completo da origem (canônico)
  raw_body         TEXT NOT NULL,               -- bytes exatos recebidos p/ re-verificar assinatura
  signature_status TEXT NOT NULL DEFAULT 'not_required'
                   CHECK (signature_status IN ('verified','failed','not_required')),
  schema_version   TEXT NOT NULL DEFAULT 'mcf_control_event/v1',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now() -- chave candidata p/ particionamento futuro
);

CREATE INDEX idx_source_events_occurred ON source_events (occurred_at DESC);
CREATE INDEX idx_source_events_type      ON source_events (source, event_type);
CREATE INDEX idx_source_events_mission   ON source_events (mission_id) WHERE mission_id IS NOT NULL;
```

### 5.2 Regra anti-drift ([ARQ] — mei divergência ao SQL da SOFIA)
- A SOFIA promoveu **muitas** colunas (`phase_id`, `agent_id`, `skill_id`, `repository`, `commit_sha`, etc.) **paralelas ao `payload`**. Duplicá-las e o `payload` cria risco de divergência (coluna muda, JSON não, e vice-versa).
- **Regra:** promovo **apenas** as colunas estritamente necessárias para filtro/índice (`event_id`, `event_type`, `source`, `occurred_at`, `received_at`, `mission_id`, `schema_version`). Todo o resto vive em `body`. Na ingest, colunas promovidas são **derivadas do `body`** no servidor — nunca aceitas do cliente.
- [`signature_valid BOOLEAN` → `signature_status` TEXT] preserva a distinção **`not_required`** (não assinado) vs **`failed`** (assinado e inválido) — matéria que a auditoria da Emily precisa distinguir, e que um booleano apaga.

### 5.3 `ingest_receipts` — gap da SOFIA ([ENG])
```sql
CREATE TABLE ingest_receipts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_event_id    TEXT,                      -- FK lógico para source_events.event_id
  delivery_id        TEXT,                      -- X-GitHub-Delivery p/ github; t+event_id p/ mcf
  outcome            TEXT NOT NULL CHECK (outcome IN
                        ('accepted','duplicate','rejected_schema','rejected_signature','rejected_version','rejected_rate')),
  status_code        INT NOT NULL,
  received_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_headers        JSONB,                     -- heads relevantes p/ auditoria
  result             JSONB
);
```
Um `GATE_REJECTED_*` nunca grava linha em `source_events`, mas **sempre** grava receipt — exigência do contrato ("cada evento gera um ingest_receipt de aceitação/rejeição").

### 5.4 Enforcement de append-only ([ARQ] — não endereçado pela SOFIA)
Postgres não tem append-only nativo em tabela comum. Exigir:
```sql
-- revogar escrita/destruição do papel da app
REVOKE UPDATE, DELETE ON source_events, ingest_receipts FROM mcf_filter_post_graphql;
-- disparar exceção se alguém tentar
CREATE OR REPLACE FUNCTION enforce_append_only() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'ledger is append-only'; END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_source_events_append_only
  BEFORE UPDATE OR DELETE ON source_events
  FOR EACH ROW EXECUTE FUNCTION enforce_append_only();
```
(Adaptar ao papel real do projeto Supabase.) Corrigir projeção = **reconstruir a partir do ledger**, nunca editar via método de escrita da app.

### 5.5 Particionamento/TTL ([HIP] — decidir com LÉO, empreendida, não bloqueia)
- **v1:** **sem particionamento**. Adiciono `created_at` como chave candidata para particionamento mensal futuro.
- **TTL:** **não eliminar** nesta fase; `source_events` é a única tabela que cresce sem limite. Monitorar por ~3 meses e só então decidir TTL com LÉO (conforme risco 4.3 da SOFIA).

### 5.6 O que a GitHub escreve (`/api/webhooks/github`)
- Validation `X-Hub-Signature-256` (raw body de GitHub).
- Idempotência por `X-GitHub-Delivery`.
- Mapear GitHub→`event_type` com prefixo de domínio, ex.: `pull_request.opened` → `github:pull_request.opened` (tabela de mapeamento documentada, 5.2 da SOFIA).
- Aplica a mesma regra anti-drift e append-only.

---

## 6. ORDEM DE IMPLEMENTAÇÃO E4

Pré-condição normativa: **BLOCKER-1/2 aprovados por SOFIA/MESTRE** no contrato (não invento spec). A ordem abaixo desbloqueia E4 já na trilha GitHub, antes dos contratos fecharem.

**Fase 0 — Fundação (paralela à correção dos blockers)**
1. Scaffold Next.js/TS na Vercel + prov. Supabase; `.env`/`.env.example`; `supabase/migrations/`.
2. **Tag `gitpulse-baseline-v1` + branch `legacy/gitpulse` congelada** (NÃO-BLOCKER-2/Option A) antes de qualquer mutação no código GitPulse.
3. Migration 001: `source_events`, `ingest_receipts`, triggers append-only, índices (per §5).

**Fase A — GitHub server-side (primeiro entregável de E4)**
4. `/api/webhooks/github`: validação `X-Hub-Signature-256`, idempotência por `X-GitHub-Delivery`, mapeamento → `source_events`.
5. Projeções GitHub (`github_repositories/pull_requests/issues/releases/activity`) + adaptador Realtime isolado.
6. UI GitPulse lendo projeções com rastreamento LIVE; **polling como fallback** com regra de degradação (NÃO-BLOCKER-4).

**Fase B — MCF Runtime outbound (depende de BLOCKER-1/2 + NÃO-BLOCKER-1)**
7. `/api/ingest/mcf` com verificação HMAC corrigida (§4): corpo bruto + timestamp + `event_id` idempotente.
8. Alinhar semântica de projeções MCF (`missions/mission_phases/agents/gates/handoffs`) com SOFIA+LÉO antes de implementar (D4/D5) → projeções MCF + UI Mission Control LIVE.
9. Reconciliador GitHub diário (NÃO-BLOCKER-3) como safety net; agendamento 3 AM UTC.

**Fase C — Encerramento E4**
10. Regra LIVE completa no UI (tooltip/metadata com source/occurred_at/received_at; STALE quando sem `source_event_id` válido).
11. Auth antes de expor dados MCF (dados públicos GitHub permanecem acessíveis pré-auth); nenhum secret no bundle.
12. Docs de deploy alternativo (VPS + Postgres) para portabilidade.

**Bloqueios externos dependentes de autoridade (retornar a SOFIA/MESTRE):** spec final de BLOCKER-1/2 no contrato; decisão de TTL (LÉO); semântica de projeções MCF (NÃO-BLOCKER-1).

---

## 7. TESTES MÍNIMOS E ROLLBACK

### Testes mínimos (automatizáveis; base do critério 6.x da SOFIA)
- **[Cripto/ingest MCF]** HMAC válido → 202 + receipt; **payload/vírgula/são mutado** → 401; `t` fora de janela → 401; `event_id` duplicado → 200 no-op com receipt anterior; schema inválido → 400 e **não persiste**; versão desconhecida → 422.
- **[Webhook GitHub]** assinatura inválida → 4xx; `X-GitHub-Delivery` repetido → sem duplicação; mapeamento correto para `event_type`.
- **[Ledger append-only]** `UPDATE`/`DELETE` em `source_events`/`ingest_receipts` → exceção; colunas promovidas sempre derivadas do `body`.
- **[Projeção]** aplicar mesmo evento 2× → estado idêntico (idempotente); reconstruir projeção a partir do ledger → estado igual.
- **[Realtime/degrad]** heartbeat ausente >30s → polling ativo a cada 10s + banner "Modo Degradado"; reconexão exp. (5/10/20/60s).
- **[LIVE]** campo sem `source_event_id` válido → `STALE`/`UNKNOWN`; nenhum LIVE fabricado.
- **[Portabilidade]** migrations aplicam em Postgres puro (não-Supabase); zero função proprietária Vercel em lógica de domínio.

### Rollback (mecanismo principal = ledger)
- **Baseline:** restauração a `gitpulse-baseline-v1`/`legacy/gitpulse` se regressão do GitPulse (custa o código, não os dados).
- **Migrations:** **todas reversíveis** (com `down`); migrações de E4 são **aditivas** (novas tabelas) → sem destrutivo em dados existentes.
- **Dados de projeção:** como o ledger é append-only e canônico, **rollback = drop da projeção + rebuild a partir de `source_events`** — não há "correção destrutiva" em produções.
- **GitHub:** feature flag para alternar webhook↔polling; se webhook regredir, o fallback de polling mantém a UI viva (queda degradada, não outage).
- **Backup:** ponto-único/restore do Supabase antes de cada Fase.

---

## 8. HANDOFF PARA RICARDO

**Destinatário:** RICARDO (próximo agente, conforme missão). **Estado:** arquitetura aprovada estruturalmente; BLOCKER-1/2 **não podem ser considerados resolvidos pela redação original da SOFIA** — sigo com as correções §4/§5.

- **[Documentar]** Propor/solicitar a SOFIA/MESTRE: texto final de BLOCKER-1 (§4.1–4.5) e BLOCKER-2 (§5) no `MCF-CONTROL-EVENT-v1.md` e no `E3-CONTROL-CENTER-ARCHITECTURE.md`. Não implementar `/api/ingest/mcf` antes dessa aprovação normativa.
- **[Executar em E4]** Ordem da §6 (Fase 0 → A → B → C), começando pela trilha GitHub-first que independe dos blockers.
- **[Decisões delegadas]** Fase 0: criar a tag `gitpulse-baseline-v1`/`legacy/gitpulse` **antes** de mutação; TTL/particionamento monitorar e decidir com LÉO após 3 meses ([HIP]).
- **[Dependências de autoridade]** Semântica de projeções MCF (NÃO-BLOCKER-1) requer alinhamento SOFIA+LÉO antes da trilha B; decisão de TTL é do LÉO; partes de segurança sensíveis (validação assinatura p/ ambientes, rotação) confirmar com SOFIA.
- **[Próximo nesta sequência]** Confirmar com o MESTRE se o próximo agente é RICARDO (conforme missão) e se a auditoria final de segurança segue com EMILY (conforme SOFIA) — não assumo a ordem; aguardo a autoridade da missão.

---

**Evidência mínima (cf. contrato `agents/RAFAEL.md`):**
- Artefatos analisados (somente leitura): `agents/RAFAEL.md`, `source/E3-CONTROL-CENTER-ARCHITECTURE.md` (linhas 49, 52–61, 85, 99, 125), `source/MCF-CONTROL-EVENT-v1.md` (linhas 28–68), `handoff/SOFIA-E3-ARCHITECTURE-REVIEW.md` (todo).
- Critérios aplicados: método mínimo do contrato; separação entre [ARQ]/[ENG]/[HIP]; regra "não aceitar automaticamente parecer de SOFIA".
- Resultado: verdicto §1, blockers §3, correções §4/§5, ordem §6, testes/rollback §7, handoff §8.
- Limitações: não implementei código nem validei em runtime local (missão proíbe alteração de arquivos e ação externa); oracle/valores de scaling ([HIP]) não verificados.
- Condição de aceite: resolver BLOCKER-1 (com HMAC sobre corpo bruto + janela de transporte, sem assinatura opcional) e BLOCKER-2 (schema com `raw_body`, `signature_status`, `ingest_receipts`, append-only enforcement) formalizados no contrato antes do início da trilha B de E4.
