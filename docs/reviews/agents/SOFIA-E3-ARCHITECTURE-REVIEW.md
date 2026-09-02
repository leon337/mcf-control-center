# REVISÃO ARQUITETURAL — MCF CONTROL CENTER E3

**Arquiteta:** SOFIA
**Data:** 2026-09-02T19:57:57Z
**Artefatos analisados:**
- `/tmp/mcf-control-center-e3/source/E3-CONTROL-CENTER-ARCHITECTURE.md`
- `/tmp/mcf-control-center-e3/source/MCF-CONTROL-EVENT-v1.md`
- `/tmp/mcf-control-center-e3/agents/SOFIA.md`

---

## 1. VEREDITO — **APROVADA COM CORREÇÕES**

A arquitetura proposta é estruturalmente sólida e alinhada com os princípios de event sourcing, separação de fontes de verdade e portabilidade. As decisões centrais são defensáveis. Existem **2 BLOCKER** e **5 NÃO-BLOCKER** que devem ser endereçadas antes ou durante E4.

---

## 2. DECISÕES ARQUITETURAIS ACEITAS

### 2.1 Princípio "Interface nunca é fonte de verdade"
✅ **ACEITO**. A inversão de dependência está correta: o cockpit projeta estado recebido de GitHub e MCF Runtime, não inventa estado próprio.

### 2.2 Event ledger + Projections
✅ **ACEITO**. A separação entre `source_events` (append-only) e projeções materializadas (`missions`, `github_pull_requests`, etc.) é padrão CQRS/Event Sourcing e atende requisitos de auditoria e reconstrução de estado.

### 2.3 Push model (MCF Runtime → Control Center)
✅ **ACEITO**. O runtime envia eventos outbound via HTTPS POST assinado, eliminando necessidade de abrir portas de entrada no notebook/VPS. Decisão correta para segurança e simplicidade operacional.

### 2.4 Portabilidade (Vercel + Supabase → VPS futuro)
✅ **ACEITO**. Restrições propostas (PostgreSQL canônico, contratos em TypeScript padrão, env vars, migrations versionados, adaptador de realtime isolado) asseguram migração sem refatoração estrutural. O lockdown contra funções proprietárias da Vercel está explícito.

### 2.5 Regra LIVE
✅ **ACEITO**. Exigir rastreamento de `source`, `source_event_id`, `occurred_at`, `received_at`, SHA e estado de verificação para qualquer campo marcado LIVE é rigor apropriado. A degradação para `STALE`/`DEGRADED`/`UNKNOWN` quando origem indisponível é honesta e necessária.

### 2.6 Read-only first, comandos depois
✅ **ACEITO**. Deferindo escrita/comandos para pós-autenticação e exigindo que ação atravesse boundary governado do MCF com receipt verificável, a arquitetura evita simulação de estado e preserva integridade.

---

## 3. CORREÇÕES OBRIGATÓRIAS

### 🚨 BLOCKER-1: Especificação de autenticação/assinatura do envelope MCF ausente

**Localização:** `MCF-CONTROL-EVENT-v1.md`, linha 54.

**Problema:** O contrato exige "autenticação/assinatura no transporte" para eventos sensíveis, mas não define:
- algoritmo de assinatura (HMAC-SHA256? Ed25519? JWT?);
- onde a assinatura viaja (header `X-MCF-Signature`? campo `signature` no payload?);
- rotação de chaves;
- tratamento de replay (janela temporal? nonce?);
- distinção entre eventos públicos e sensíveis.

**Impacto:** Sem isso, `/api/ingest/mcf` não pode ser implementado com segurança verificável. Qualquer ator com acesso à URL pode injetar eventos falsos.

**Correção obrigatória:**
Adicionar seção **"Autenticação e Assinatura"** ao contrato MCF-CONTROL-EVENT-v1 definindo:
1. HMAC-SHA256 sobre corpo canônico (`eventId|occurredAt|eventType|missionId`) com secret compartilhado via env var `MCF_RUNTIME_SIGNING_SECRET`;
2. Assinatura em header `X-MCF-Signature: sha256=<hex>`;
3. Janela de replay de 5 minutos baseada em `occurredAt` vs. `receivedAt`;
4. Lista de `eventType` sensíveis que DEVEM ser assinados vs. públicos opcionais;
5. Procedimento de rotação de secret (período de sobreposição com validação de dois secrets).

---

### 🚨 BLOCKER-2: Schema de `source_events` não especificado

**Localização:** `E3-CONTROL-CENTER-ARCHITECTURE.md`, linha 49.

**Problema:** A tabela `source_events` é descrita como ledger imutável, mas não há especificação de colunas, índices, particionamento ou TTL. O contrato MCF-CONTROL-EVENT-v1 define o envelope JSON, mas não como ele persiste.

**Impacto:** Rafael não pode criar migrations sem decisão sobre:
- `payload` como `JSONB` ou `TEXT`?
- índices em `eventType`, `missionId`, `occurredAt`?
- particionamento por data para escala futura?
- retenção infinita ou TTL após X meses?

**Correção obrigatória:**
Adicionar ao documento E3-CONTROL-CENTER-ARCHITECTURE.md, seção **"Schema detalhado do Ledger"**:

```sql
CREATE TABLE source_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE, -- do envelope
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
  signature_valid BOOLEAN,
  schema_version TEXT NOT NULL DEFAULT 'mcf_control_event/v1'
);

CREATE INDEX idx_source_events_occurred ON source_events(occurred_at DESC);
CREATE INDEX idx_source_events_type ON source_events(event_type);
CREATE INDEX idx_source_events_mission ON source_events(mission_id) WHERE mission_id IS NOT NULL;
```

Decisão sobre particionamento mensal pode ser delegada a Rafael, mas estrutura base é blocker.

---

### ⚠️ NÃO-BLOCKER-1: Falta especificação de projeções MCF

**Localização:** `E3-CONTROL-CENTER-ARCHITECTURE.md`, linhas 52-61.

**Problema:** As projeções MCF (`missions`, `mission_phases`, `agents`, `skills`, `mission_assignments`, `handoffs`, `gates`, `evidence_receipts`, `runtime_snapshots`) são listadas mas não especificadas. Campos, chaves, relações e índices ausentes.

**Impacto:** Rafael precisará inventá-las ou voltar para SOFIA/MESTRE. Não bloqueia início de E4 porque GitHub pode ser implementado primeiro, mas atrasa integração MCF.

**Recomendação:**
Antes de handoff para Rafael, adicionar ao documento esquema mínimo de cada projeção com:
- chaves primárias e estrangeiras;
- campos de rastreamento LIVE (`source_event_id`, `last_updated_at`);
- índices de leitura esperados pelo cockpit.

Pode ser delegado para subagente especialista antes de E4 ou feito colaborativamente com Rafael em início de E4.

---

### ⚠️ NÃO-BLOCKER-2: GitPulse baseline não tem contrato de preservação

**Localização:** `E3-CONTROL-CENTER-ARCHITECTURE.md`, linha 85.

**Problema:** "Preservar o GitPulse como baseline funcional" não define **como** preservar: branch separada? tag? snapshot em diretório paralelo? Se a refatoração for incremental no mesmo código, há risco de regressão silenciosa.

**Recomendação:**
Definir estratégia explícita:
- **Opção A (conservadora):** Tag `gitpulse-baseline-v1` antes de qualquer mudança; branch `legacy/gitpulse` congelada.
- **Opção B (incremental):** Feature flags para habilitar novo backend GitHub sem remover polling antigo até validação.

Não bloqueia E4 porque GitPulse já existe e funciona; decisão pode ser tomada por Rafael/LÉO em início de implementação.

---

### ⚠️ NÃO-BLOCKER-3: Reconciliação GitHub não especificada

**Localização:** `E3-CONTROL-CENTER-ARCHITECTURE.md`, linha 99.

**Problema:** "Um job de reconciliação periódico pode conferir divergências sem ser a fonte primária" não define:
- frequência (horária? diária?);
- scope (só missões ativas? todo histórico?);
- ação em caso de divergência (alert? auto-correção? log?).

**Recomendação:**
Definir contrato mínimo do reconciliador:
1. **Frequência:** 1x/dia às 3 AM UTC;
2. **Scope:** PRs/issues abertos + último commit de cada branch ativa;
3. **Ação:** log de divergência em tabela `reconciliation_alerts`; humano decide correção.

Não bloqueia E4 porque webhook é fonte primária; reconciliador é safety net futuro.

---

### ⚠️ NÃO-BLOCKER-4: Realtime fallback para polling não especificado

**Localização:** `E3-CONTROL-CENTER-ARCHITECTURE.md`, linha 44.

**Problema:** "Polling fica como fallback, não como mecanismo primário" não define quando fallback ativa nem como UI detecta falha de Realtime.

**Recomendação:**
Adicionar regra de degradação:
- UI detecta perda de Realtime (heartbeat ausente por >30s ou erro de conexão);
- ativa polling de `/api/state/summary` a cada 10s;
- exibe banner "Modo Degradado — Realtime indisponível";
- tenta reconectar Realtime exponencialmente (5s, 10s, 20s, max 60s).

Pode ser implementado progressivamente; não bloqueia primeiro deploy read-only.

---

### ⚠️ NÃO-BLOCKER-5: Boundary de comandos futuros não detalhado

**Localização:** `E3-CONTROL-CENTER-ARCHITECTURE.md`, linha 125.

**Problema:** "A ação deve atravessar o boundary governado do MCF e retornar receipt verificável" não define como comandos serão roteados:
- UI → API Vercel → MCF Runtime via webhook?
- UI → API Vercel → fila → MCF Runtime poll?
- UI → API Vercel que cria `command_request` e aguarda evento `COMMAND_COMPLETED`?

**Recomendação:**
Não precisa ser resolvido antes de E4 porque comandos estão explicitamente fora de scope de E3. Quando chegar essa fase, SOFIA deve revisar contrato de comando antes de implementação.

---

## 4. RISCOS E ACOPLAMENTOS

### 4.1 Dependência de Supabase Realtime
**Risco:** Se Supabase Realtime tiver mudança incompatível de API ou limite de conexões insuficiente, toda experiência "live" quebra.

**Mitigação proposta:** Adaptador isolado (`lib/realtime-adapter.ts`) + fallback para polling já previsto. Aceitável.

### 4.2 Rate limit de GitHub webhooks
**Risco:** GitHub não garante entrega imediata nem ordenada de webhooks. Em rajada de eventos (ex: merge de 50 PRs), pode haver delay ou perda.

**Mitigação proposta:** Job de reconciliação periódico detecta divergências. Aceitável para primeira versão; escala futura pode exigir fila durável entre webhook e ingest.

### 4.3 Explosão de `source_events`
**Risco:** Sem TTL ou particionamento, tabela cresce indefinidamente. 1 milhão de eventos = ~1 GB de JSONB; pode afetar índices e backup.

**Mitigação ausente:** BLOCKER-2 obriga especificação de índices; decisão de TTL/particionamento pode ser delegada a Rafael com monitoramento nos primeiros 3 meses.

### 4.4 Acoplamento entre projeções MCF e domínio do runtime
**Risco:** Se estrutura de `missions`, `gates`, `handoffs` no Control Center divergir do modelo mental do MCF Runtime, eventos não vão projetar corretamente e UI exibirá estado inconsistente.

**Mitigação proposta:** Contrato explícito MCF-CONTROL-EVENT-v1 como boundary. **Recomendação adicional:** Antes de E4, fazer workshop de alinhamento SOFIA + LÉO + Rafael sobre semântica de `GATE_OPENED` vs. `GATE_RESOLVED`, `HANDOFF_CREATED` vs. agent transition, etc.

---

## 5. FRONTEIRAS E CONTRATOS A ENDURECER

### 5.1 `/api/ingest/mcf`
**Status:** DRAFT.
**Falta definir:**
- autenticação/assinatura (BLOCKER-1);
- resposta de sucesso/erro (200 com receipt ID? 202 accepted? 400 schema inválido?);
- idempotência (rejeitar `event_id` duplicado ou retornar receipt anterior?);
- rate limit (quantos eventos/min o runtime pode enviar?).

**Handoff para Rafael:** Após correção de BLOCKER-1, criar spec OpenAPI do endpoint.

---

### 5.2 `/api/webhooks/github`
**Status:** IMPLÍCITO, não especificado.
**Falta definir:**
- quais eventos GitHub são aceitos (`pull_request`, `push`, `issues`, `release`?);
- validação de assinatura `X-Hub-Signature-256`;
- mapeamento de evento GitHub → `source_events` (qual `eventType` corresponde a `pull_request.opened`?).

**Handoff para Rafael:** Criar tabela de mapeamento GitHub webhook → `source_events.event_type`.

---

### 5.3 Schema de projeções MCF
**Status:** LISTADO, não especificado (NÃO-BLOCKER-1).
**Ação:** Delegar para subagente ou workshop antes de E4.

---

### 5.4 Contrato de Realtime
**Status:** AUSENTE.
**Falta definir:**
- quais tabelas devem emitir notificação (`missions`, `github_pull_requests`?);
- filtros de subscrição no cliente (por `missionId`? por `repository`?);
- formato de mensagem Realtime vs. fetch manual.

**Handoff para Rafael:** Documentar em `docs/contracts/REALTIME-SUBSCRIPTIONS-v1.md` antes de conectar UI.

---

## 6. CRITÉRIOS DE INTEGRAÇÃO PARA E4

Antes de considerar E4 completo, estas condições devem ser verificadas:

### 6.1 GitHub server-side
- [ ] `/api/webhooks/github` recebe e valida assinatura GitHub;
- [ ] eventos GitHub persistem em `source_events`;
- [ ] projeções `github_pull_requests`, `github_issues` atualizam transacionalmente;
- [ ] UI exibe dados de GitHub com rastreamento LIVE (source, timestamp, commit SHA);
- [ ] fallback de polling permanece funcional se webhook falhar;
- [ ] baseline GitPulse preservado (tag ou branch).

### 6.2 MCF Runtime outbound
- [ ] `/api/ingest/mcf` valida assinatura conforme BLOCKER-1 corrigido;
- [ ] eventos MCF persistem em `source_events`;
- [ ] projeções `missions`, `mission_phases`, `agents` atualizam corretamente;
- [ ] UI Mission Control exibe estado de missão com rastreamento LIVE;
- [ ] idempotência de `event_id` funciona (reenvio não duplica);
- [ ] evento com schema inválido retorna erro claro e não persiste.

### 6.3 Realtime + fallback
- [ ] mudanças nas projeções propagam para UI via Supabase Realtime em <2s;
- [ ] UI detecta perda de Realtime e ativa polling;
- [ ] UI exibe banner "Modo Degradado" quando em fallback;
- [ ] reconexão automática funciona após falha temporária.

### 6.4 Regra LIVE
- [ ] todo campo marcado LIVE no UI tem tooltip ou metadata mostrando `source`, `occurred_at`, `received_at`;
- [ ] se projeção não tem `source_event_id` válido, UI exibe `STALE` ou `UNKNOWN`;
- [ ] nenhum dado inventado ou simulado é exibido como LIVE.

### 6.5 Portabilidade
- [ ] migrations SQL versionadas em `supabase/migrations/`;
- [ ] nenhuma função proprietária Vercel em lógica de domínio;
- [ ] URLs e secrets em `.env` com `.env.example` documentado;
- [ ] adaptador de Realtime isolado em `lib/realtime-adapter.ts`;
- [ ] README tem seção "Deploy alternativo" com instruções para VPS + PostgreSQL.

### 6.6 Segurança pre-auth
- [ ] nenhuma variável de ambiente secreta exposta no bundle do cliente;
- [ ] dados de MCF só retornam após futura autenticação (pode retornar mock ou vazio em E4);
- [ ] dados públicos de GitHub podem ser exibidos sem autenticação.

---

## 7. HANDOFF PARA RAFAEL

Rafael (Engenharia de Software), a arquitetura está estruturalmente aprovada com as correções obrigatórias listadas. Seu trabalho em E4:

### Pré-requisitos imediatos
1. **BLOCKER-1:** SOFIA ou MESTRE deve especificar autenticação/assinatura do envelope MCF antes de você implementar `/api/ingest/mcf`. Não invente; aguarde decisão.
2. **BLOCKER-2:** Implemente schema de `source_events` conforme especificação que SOFIA adicionará ao documento ou conforme SQL sugerido nesta revisão. Confirme decisão sobre TTL/particionamento com LÉO.

### Seu scope de E4
- Criar estrutura Next.js/TypeScript no Vercel com projeto Supabase conectado;
- Migrations SQL para `source_events`, `ingest_receipts` e projeções iniciais (GitHub primeiro, MCF depois);
- Implementar `/api/webhooks/github` com validação de assinatura e persistência;
- Implementar `/api/ingest/mcf` conforme contrato corrigido (aguardar BLOCKER-1);
- Conectar Supabase Realtime no cliente com adaptador isolado;
- Criar UI básico de Mission Control e GitPulse lendo projeções;
- Implementar fallback de polling conforme NÃO-BLOCKER-4;
- Implementar regra LIVE com rastreamento de fonte em tooltip/metadata;
- Documentar deploy alternativo para portabilidade futura.

### O que NÃO fazer
- Não crie comandos/escrita ainda; apenas observação;
- Não presuma schema de projeções MCF sem alinhamento (NÃO-BLOCKER-1);
- Não contorne autenticação/assinatura; aguarde spec;
- Não use funções proprietárias Vercel em lógica de domínio.

### Handoff para Emily (auditoria)
Após implementação de E4, Emily deve auditar:
- validação de assinatura GitHub e MCF;
- ausência de secrets no bundle cliente;
- idempotência de ingest;
- integridade de `source_events` append-only;
- rastreamento LIVE completo.

---

**Status final:** Arquitetura pronta para E4 após correção de BLOCKER-1 e BLOCKER-2. SOFIA permanece disponível para alinhamento de projeções MCF (NÃO-BLOCKER-1) e revisão de contratos de comando futuros.
