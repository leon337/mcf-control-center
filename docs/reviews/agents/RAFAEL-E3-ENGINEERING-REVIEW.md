## VEREDITO DE ENGENHARIA

A arquitetura proposta em **E3-CONTROL-CENTER-ARCHITECTURE.md** é **estruturalmente sólida** e alinhada com princípios de event sourcing, separação de fontes de verdade e portabilidade. As decisões centrais (interface nunca é fonte de verdade, event ledger + projections, push model do MCF Runtime, portabilidade Vercel+Supabase → VPS, regra LIVE, read-only first) são defensáveis.

No entanto, existem **2 BLOCKERS** e **5 NÃO-BLOCKER** que precisam ser resolvidos antes de E4. Como **RAFAEL**, não posso inventar especificações de segurança ou schema de banco sem autorização formal, nem alterar arquivos. Devo entregar um veredito técnico claro sobre implementabilidade e decisões necessárias.

---

## 2. VALIDAÇÃO DOS 2 BLOCKERS DE SOFIA

### 🚨 BLOCKER-1: Especificação de autenticação/assinatura do envelope MCF ausente

**Localização:** `source/MCF-CONTROL-EVENT-v1.md`, linha 54

**Status:** ✅ **CONFIRMADO como BLOCKER**

**Problema técnico:**
O contrato exige "autenticação/assinatura no transporte" para eventos sensíveis, mas não define:
- Algoritmo de assinatura (HMAC-SHA256? Ed25519? JWT?)
- Localização da assinatura no payload (header `X-MCF-Signature`? campo `signature`?)
- Mecanismo de rotação de chaves
- Tratamento de replay (janela temporal? nonce?)
- Distinção entre eventos públicos vs. sensíveis

**Impacto de engenharia:**
- Sem isso, `/api/ingest/mcf` não pode ser implementado com segurança verificável
- Qualquer ator com acesso à URL pode injetar eventos falsos
- Quebra o contrato de segurança por fases definido na arquitetura (linha 122: "Secrets ficam exclusivamente em variáveis server-side")
- Prejudica integração com MCF Runtime outbound

**Decisão RAFAEL:**
- Não posso inventar algoritmo ou esquema de assinatura
- **Bloqueio:** Implementação de `/api/ingest/mcf` não pode prosseguir até que SOFIA ou MESTRE especifique contrato de autenticação/assinatura
- Ação: Aguardar especificação formal em `MCF-CONTROL-EVENT-v1.md` antes de implementar

---

### 🚨 BLOCKER-2: Schema de `source_events` não especificado

**Localização:** `source/E3-CONTROL-CENTER-ARCHITECTURE.md`, linha 49

**Status:** ✅ **CONFIRMADO como BLOCKER**

**Problema técnico:**
A tabela `source_events` é descrita como ledger imutável, mas não há especificação de:
- Colunas e tipos de dados (`payload` como `JSONB` ou `TEXT`?)
- Índices necessários (`eventType`, `missionId`, `occurredAt`)
- Estrutura de `ingest_receipts`
- Particionamento por data para escala futura
- TTL ou retenção de dados

**Impacto de engenharia:**
- Não posso criar migrations SQL sem decisão sobre estrutura
- Sem índices adequados, consultas de projeções serão lentas
- Sem particionamento, tabela crescerá indefinidamente (Risco 4.3 da revisão)
- Quebra princípio de "Schema inicial proposto" (linha 46-68)

**Decisão RAFAEL:**
- SOFIA forneceu especificação SQL sugerida na revisão (linhas 80-104)
- Decisão sobre TTL/particionamento pode ser delegada a Rafael com monitoramento
- **Bloqueio:** Migrações SQL não podem ser criadas sem confirmação de estrutura base
- Ação: Implementar schema conforme especificação sugerida, mas confirmar decisões de retenção/particionamento com LÉO antes de production

---

## 3. DECISÕES DE ENGENHARIA NECESSÁRIAS ANTES DE E4

### Decisão técnica obrigatória #1: Especificação de autenticação MCF

**Pergunta:** Qual esquema de assinatura deve ser usado?

**Opções RAFAEL (sem inventar):**
1. **HMAC-SHA256** sobre corpo canônico (`eventId|occurredAt|eventType|missionId`) com secret compartilhado via env var `MCF_RUNTIME_SIGNING_SECRET`
   - Pro: Simples, padrão web, fácil rotação
   - Contra: Não garante autenticidade do emissor (apenas integridade)
2. **Ed25519** (X.509 ou JWT)
   - Pro: Autenticidade do emissor, curva elíptica segura
   - Contra: Mais complexo, requer certificados ou JWKS
3. **JWT com assinatura RS256**
   - Pro: Padronizado, header/claims explícitos
   - Contra: Requer gerenciamento de chaves privadas

**Decisão RAFAEL:** Não posso escolher. Preciso de especificação formal de SOFIA ou MESTRE.

---

### Decisão técnica obrigatória #2: Estrutura de `source_events`

**Pergunta:** Como estruturar o ledger?

**Decisão RAFAEL:**
- Usar especificação SQL sugerida por SOFIA (linhas 80-104 de `SOFIA-E3-ARCHITECTURE-REVIEW.md`)
- `payload` como `JSONB` (permite query parcial e índices)
- Índices: `occurred_at DESC`, `event_type`, `mission_id` (filter WHERE)
- `signature_valid` como coluna booleana para auditoria
- `schema_version` para evolução futura

**Decisão pendente:** TTL ou particionamento mensal — confirmar com LÉO antes de production

---

### Decisão técnica recomendada #3: Projeções MCF

**Pergunta:** Como estruturar as tabelas de projeção?

**Decisão RAFAEL:**
- SOFIA lista projeções (linhas 52-61 de arquitetura), mas não especifica schema
- **Bloqueio:** Não posso implementar projeções MCF sem alinhamento prévio
- **Recomendação:** Workshop com SOFIA + LÉO + Rafael antes de E4 para definir campos, chaves e relações
- **Risco:** Se estrutura divergir do mental model do MCF Runtime, eventos não projetarão corretamente (Risco 4.4)

---

### Decisão técnica recomendada #4: Reconciliação GitHub

**Pergunta:** Como especificar o reconciliador periódico?

**Decisão RAFAEL:**
- SOFIA recomenda (NÃO-BLOCKER-3): 1x/dia às 3 AM UTC, scope PRs/issues abertos + último commit de cada branch ativa
- **Recomendação:** Implementar como job agendado (cron) no Vercel ou separado no futuro
- **Ação:** Criar tabela `reconciliation_alerts` para log de divergências

---

### Decisão técnica recomendada #5: Realtime fallback

**Pergunta:** Como especificar degradação de Realtime?

**Decisão RAFAEL:**
- SOFIA recomenda (NÃO-BLOCKER-4): UI detecta perda de Realtime (heartbeat >30s), ativa polling 10s, banner "Modo Degradado", reconexão exponencial (5s, 10s, 20s, max 60s)
- **Implementação possível:** Adaptador isolado (`lib/realtime-adapter.ts`) com hooks para polling
- **Ação:** Implementar como feature flag ou progressiva, não bloquear primeiro deploy read-only

---

## 4. SCHEMA/ÍNDICES/TRANSAÇÕES — CORREÇÕES CONCRETAS

### 4.1 Correção de BLOCKER-1 (autenticação MCF)

**Definição obrigatória (SOFIA deve adicionar a `MCF-CONTROL-EVENT-v1.md`):**

```markdown
## Autenticação e Assinatura

1. **Algoritmo:** HMAC-SHA256 sobre corpo canônico
   - Cânico: `eventId|occurredAt|eventType|missionId|repository|commitSha|missionVersion`
   - Secret: `MCF_RUNTIME_SIGNING_SECRET` (env var, 64+ chars)
   - Assinatura: `X-MCF-Signature: sha256=<hex>`
   - Versão: `X-MCF-Signature-Version: v1`

2. **Tratamento de replay:**
   - Janela de 5 minutos baseada em `occurredAt` vs `receivedAt`
   - Se `receivedAt - occurredAt > 5min`, rejeitar como replay

3. **Eventos sensíveis:**
   - Sempre assinados: `MISSION_STARTED`, `PHASE_STARTED`, `HANDOFF_CREATED`, `GATE_OPENED`, `GATE_RESOLVED`, `EVIDENCE_REJECTED`
   - Opcionais: `MISSION_COMPLETED`, `RUNTIME_HEALTH_CHANGED`

4. **Rotação de chaves:**
   - Período de sobreposição de 7 dias
   - Validar contra duas chaves antigas e atual
```

**Implementação RAFAEL (após especificação):**
- Endpoint `/api/ingest/mcf` valida assinatura antes de persistir
- Armazena `signature_valid` em `source_events` para auditoria
- Retorna `401 UNAUTHORIZED` se assinatura inválida ou replay

---

### 4.2 Correção de BLOCKER-2 (schema `source_events`)

**Definição concreta (RAFAEL pode implementar):**

```sql
-- Ledger de eventos
CREATE TABLE source_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,          -- do envelope
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  mission_id UUID,
  phase_id UUID,
  agent_id TEXT,
  skill_id TEXT,
  repository TEXT,
  commit_sha TEXT,
  mission_version INTEGER,
  evidence_ref TEXT,
  payload JSONB NOT NULL,
  signature_valid BOOLEAN NOT NULL DEFAULT FALSE,
  schema_version TEXT NOT NULL DEFAULT 'mcf_control_event/v1'
);

-- Índices de leitura
CREATE INDEX idx_source_events_occurred ON source_events(occurred_at DESC);
CREATE INDEX idx_source_events_type ON source_events(event_type);
CREATE INDEX idx_source_events_mission ON source_events(mission_id) WHERE mission_id IS NOT NULL;

-- Tabela de receipts de ingestão
CREATE TABLE ingest_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('ACCEPTED', 'REJECTED', 'DUPLICATE')),
  reason TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ingest_receipts_event ON ingest_receipts(event_id);
```

**Decisão de retenção/particionamento:**
- **Risco:** Sem TTL ou particionamento, tabela cresce indefinidamente
- **RAFAEL:** Propor particionamento mensal por `occurred_at` para scale futuro
- **Ação:** Confirmar com LÉO antes de production

---

### 4.3 Transações de projeção

**Decisão RAFAEL:**
- Cada evento gera:
  1. Linha imutável em `source_events`
  2. Linha em `ingest_receipts`
  3. Atualização transacional das projeções correspondentes

**Implementação:**
- Usar `BEGIN; INSERT INTO source_events ...; INSERT INTO ingest_receipts ...; UPDATE projections ...; COMMIT;`
- Se qualquer passo falhar, rollback completo
- Usar `ON CONFLICT` para idempotência de `event_id`

---

## 5. API/IDEMPOTÊNCIA/ERROS — CONTRATO MÍNIMO

### 5.1 Endpoint `/api/ingest/mcf`

**Status:** DRAFT — bloqueado por BLOCKER-1

**Resposta esperada (após especificação):**

| Código | Descrição | Body |
|--------|-----------|------|
| `200 OK` | Evento aceito e persistido | `{"receiptId": "uuid", "eventId": "uuid"}` |
| `202 Accepted` | Evento já existe (idempotência) | `{"receiptId": "uuid", "eventId": "uuid", "duplicate": true}` |
| `400 Bad Request` | Schema inválido ou campos obrigatórios | `{"error": "Invalid schema", "details": "..."}` |
| `401 Unauthorized` | Assinatura inválida ou replay | `{"error": "Invalid signature"}` |
| `429 Too Many Requests` | Rate limit excedido | `{"error": "Rate limit exceeded", "retryAfter": 60}` |

**Idempotência:**
- Rejeitar eventos com `event_id` duplicado (retornar 202)
- Registrar em `ingest_receipts` com `status = 'DUPLICATE'`
- Não persistir novamente

**Rate limit:**
- Definir limite: 100 eventos/minuto por IP ou por `repository`
- Usar bucket de token ou rate limiter Redis
- Retornar `429` com `Retry-After`

---

### 5.2 Endpoint `/api/webhooks/github`

**Status:** IMPLÍCITO — não especificado em arquitetura

**Decisão RAFAEL:**
- Eventos a aceitar: `pull_request`, `push`, `issues`, `release`
- Validar assinatura `X-Hub-Signature-256`
- Mapear eventos GitHub → `source_events.event_type`
- **Ação:** Criar tabela de mapeamento `github_event_type → control_center_event_type`

---

### 5.3 Contrato de erro e logging

**Decisão RAFAEL:**
- Todos os erros retornam JSON com `error` e `timestamp`
- Erros não esperados (500) logam stack trace em server
- Eventos rejeitados (400/401) persistem em `ingest_receipts` com `reason`

---

## 6. RISCOS VERCEL + SUPABASE + MIGRAÇÃO VPS

### 6.1 Dependência de Supabase Realtime

**Risco:** Se Supabase Realtime tiver mudança incompatível de API ou limite de conexões insuficiente, toda experiência "live" quebra.

**Mitigação RAFAEL:**
- Adaptador isolado (`lib/realtime-adapter.ts`) separado da lógica de domínio
- Fallback para polling já previsto (NÃO-BLOCKER-4)
- Monitorar métricas de conexões em produção

**Classificação:** **ACEITÁVEL** — mitigação presente em arquitetura

---

### 6.2 Rate limit de GitHub webhooks

**Risco:** GitHub não garante entrega imediata nem ordenada. Em rajada de eventos, pode haver delay ou perda.

**Mitigação RAFAEL:**
- Job de reconciliação periódico detecta divergências (NÃO-BLOCKER-3)
- **Risco:** Reconciliador não garante entrega; pode haver perda de eventos

**Classificação:** **ACEITÁVEL** — mitigação presente em arquitetura, mas risco de perda em rajadas

---

### 6.3 Explosão de `source_events`

**Risco:** Sem TTL ou particionamento, tabela cresce indefinidamente. 1 milhão de eventos = ~1 GB JSONB, afetando índices e backup.

**Mitigação RAFAEL:**
- **BLOCKER-2 obriga especificação de índices** (já corrigido)
- Decisão de TTL/particionamento pode ser delegada a Rafael com monitoramento nos primeiros 3 meses
- Propor particionamento mensal por `occurred_at` para scale futuro

**Classificação:** **ACEITÁVEL** — mitigação presente em especificação SQL, decisão de retenção pendente

---

### 6.4 Acoplamento entre projeções MCF e domínio do runtime

**Risco:** Se estrutura de `missions`, `gates`, `handoffs` no Control Center divergir do modelo mental do MCF Runtime, eventos não vão projetar corretamente e UI exibirá estado inconsistente.

**Mitigação RAFAEL:**
- Contrato explícito `MCF-CONTROL-EVENT-v1` como boundary
- **Recomendação:** Workshop de alinhamento SOFIA + LÉO + Rafael antes de E4

**Classificação:** **ACEITÁVEL** — mitigação proposta, não implementada ainda

---

## 7. ORDEM DE IMPLEMENTAÇÃO RECOMENDADA

### Fase 0: Resolução de BLOCKERS (SOFIA/MESTRE)

1. **BLOCKER-1:** SOFIA/MESTRE especifica autenticação/assinatura em `MCF-CONTROL-EVENT-v1.md`
2. **BLOCKER-2:** SOFIA adiciona especificação SQL de `source_events` em `E3-CONTROL-CENTER-ARCHITECTURE.md`

**Output esperado:** Contrato de assinatura e schema de ledger definidos

---

### Fase 1: Estrutura base e ledger (RAFAEL)

1. Criar estrutura Next.js/TypeScript no Vercel
2. Conectar projeto Supabase
3. Criar migrations SQL para `source_events` e `ingest_receipts` (conforme especificação BLOCKER-2)
4. Implementar tabela de mapeamento GitHub → `source_events`
5. Criar estrutura inicial de projeções GitHub (sem lógica ainda)

**Output esperado:** Banco de dados rodando, migrations versionadas

---

### Fase 2: GitHub server-side (RAFAEL)

1. Implementar `/api/webhooks/github` com validação de assinatura
2. Mapear eventos GitHub → `source_events.event_type`
3. Persistir eventos em `source_events`
4. Atualizar projeções `github_pull_requests`, `github_issues` transacionalmente
5. Implementar job de reconciliação (1x/dia, log divergências)
6. Criar UI básica de GitPulse lendo projeções
7. Implementar regra LIVE com rastreamento de fonte em tooltip/metadata

**Output esperado:** Webhook recebendo eventos, UI exibindo dados GitHub com LIVE

---

### Fase 3: MCF Runtime outbound (RAFAEL — bloqueado até BLOCKER-1 resolvido)

1. Implementar `/api/ingest/mcf` com validação de assinatura (conforme BLOCKER-1)
2. Persistir eventos em `source_events`
3. Criar projeções MCF (`missions`, `mission_phases`, `agents`, `skills`, `mission_assignments`, `handoffs`, `gates`, `evidence_receipts`, `runtime_snapshots`)
4. Atualizar projeções transacionalmente
5. Criar UI Mission Control lendo projeções MCF
6. Implementar regra LIVE para dados MCF

**Output esperado:** Runtime MCF enviando eventos, UI Mission Control exibindo estado

---

### Fase 4: Realtime + fallback (RAFAEL)

1. Conectar Supabase Realtime no cliente
2. Criar adaptador isolado (`lib/realtime-adapter.ts`)
3. Implementar detecção de perda de Realtime (heartbeat >30s)
4. Ativar polling 10s em fallback
5. Exibir banner "Modo Degradado" quando em fallback
6. Implementar reconexão exponencial (5s, 10s, 20s, max 60s)

**Output esperado:** UI atualiza em tempo real, fallback funciona em caso de falha

---

### Fase 5: Portabilidade e documentação (RAFAEL)

1. Documentar deploy alternativo para VPS + PostgreSQL
2. Verificar que nenhuma função proprietária Vercel está em lógica de domínio
3. Verificar que URLs e secrets estão em `.env` com `.env.example`
4. Verificar que adaptador de Realtime está isolado
5. Documentar migrations SQL versionadas

**Output esperado:** README com instruções de deploy alternativo

---

## 8. HANDOFF PARA RICARDO

### Estado entregue por RAFAEL

**Artefatos analisados:**
- ✅ `source/E3-CONTROL-CENTER-ARCHITECTURE.md` — arquitetura estruturalmente sólida
- ✅ `source/MCF-CONTROL-EVENT-v1.md` — contrato de evento com bloqueio de autenticação
- ✅ `source/SOFIA-E3-ARCHITECTURE-REVIEW.md` — revisão com 2 BLOCKERS e 5 NÃO-BLOCKER
- ✅ `agents/RAFAEL.md` — contrato normativo de Engenharia de Software

**Veredito:**
- Arquitetura **APROVADA** com correções obrigatórias
- **2 BLOCKERS** confirmados: autenticação MCF e schema `source_events`
- **5 NÃO-BLOCKER** identificados: projeções MCF, GitPulse baseline, reconciliação, Realtime fallback, boundary de comandos

**Decisões de engenharia necessárias antes de E4:**
1. Especificação formal de autenticação/assinatura MCF (BLOCKER-1)
2. Estrutura SQL de `source_events` (BLOCKER-2 — já sugerida por SOFIA)
3. Schema de projeções MCF (NÃO-BLOCKER-1)
4. Estratégia de preservação GitPulse (NÃO-BLOCKER-2)
5. Contrato de reconciliação GitHub (NÃO-BLOCKER-3)
6. Regra de degradação Realtime (NÃO-BLOCKER-4)

**Riscos identificados:**
- Dependência de Supabase Realtime (mitigada com adaptador + fallback)
- Rate limit GitHub webhooks (mitigada com reconciliador)
- Explosão de `source_events` (mitigada com especificação SQL + decisão de retenção)
- Acoplamento projeções MCF (mitigada com workshop prévio)

**Ordem de implementação recomendada:**
1. Resolução de BLOCKERS (SOFIA/MESTRE)
2. Estrutura base e ledger (RAFAEL)
3. GitHub server-side (RAFAEL)
4. MCF Runtime outbound (RAFAEL — bloqueado até BLOCKER-1)
5. Realtime + fallback (RAFAEL)
6. Portabilidade e documentação (RAFAEL)

---

### Handoff para Ricardo

**Ricardo, a fase E4 está bloqueada até que SOFIA ou MESTRE resolva os 2 BLOCKERS identificados.**

**Pré-requisitos para E4:**
1. **BLOCKER-1:** Especificação de autenticação/assinatura MCF em `MCF-CONTROL-EVENT-v1.md`
2. **BLOCKER-2:** Especificação SQL de `source_events` em `E3-CONTROL-CENTER-ARCHITECTURE.md`

**Seu escopo (após pré-requisitos resolvidos):**
- Criar estrutura Next.js/TypeScript no Vercel
- Criar migrations SQL para ledger e projeções
- Implementar `/api/webhooks/github` e `/api/ingest/mcf`
- Conectar Supabase Realtime com fallback
- Criar UI Mission Control e GitPulse
- Implementar regra LIVE com rastreamento de fonte
- Documentar portabilidade futura

**O que NÃO fazer:**
- Não implementar comandos/escrita ainda
- Não inventar especificações de segurança
- Não presunir schema de projeções MCF sem alinhamento

**Próxima ação:**
- Aguardar SOFIA/MESTRE resolver BLOCKERS
- Implementar E4 conforme ordem recomendada
- Entregar resultados para auditoria

---

**Status final:** Arquitetura pronta para E4 após correção de BLOCKER-1 e BLOCKER-2. SOFIA permanece disponível para alinhamento de projeções MCF (NÃO-BLOCKER-1) e revisão de contratos de comando futuros.
