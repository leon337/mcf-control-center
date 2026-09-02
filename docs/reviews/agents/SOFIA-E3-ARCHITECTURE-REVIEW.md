# Evidence provenance

- Mission: `MCF-CONTROL-CENTER-001`
- Stage: `E3`
- Agent preset: `mcf-sofia`
- DeepSeek Harness session: `session-55a8da68-d821-4a42-916c-c2729e551ebf`
- Provider: `nine-router-kiro`
- Model: `kr/claude-sonnet-4.5`
- Execution boundary: isolated read-only review workspace `/tmp/mcf-control-center-e3`
- Reviewed input SHA-256: `E2=49f19c0a3dc01f52a5be1f0697e3dde4573df5b055812b52f481a43d1a9a5a62`, `architecture=892783008a49d68b7e1103afd4f5ced55243247f78f783034d2dc6d817a62b75`, `event-contract=6ffff93d674384a001422a393e2cfa456ddded5d159db41911fe14de4646541c`
- Tool behavior observed: three `read` calls; no write/edit/delete/external action
- Final step: `2`
- Final usage: `{"inputTokens": 25192, "outputTokens": 4507}`

---

## REVISÃO ARQUITETURAL — SOFIA

**Missão:** MCF-CONTROL-CENTER-001
**Etapa:** E3 — Arquitetura do Control Center
**Data:** 2026-09-02T19:23:51Z
**Modo:** Somente leitura, análise crítica independente

---

## VEREDITO

**E3_ARCHITECTURE_REVIEW = APROVADO COM CORREÇÕES OBRIGATÓRIAS**

A arquitetura proposta é **estruturalmente sólida e suficiente** para avançar à E4 (implementação Vercel + Supabase), **sob condição de que as correções obrigatórias sejam endereçadas antes de integração runtime-to-control**.

A arquitetura **não cria acoplamento indevido** com infraestrutura temporária e preserva portabilidade futura para VPS própria conforme planejado.

---

## DECISÕES ACEITAS

### 1. Separação de responsabilidades
✅ **Interface nunca é fonte de verdade** — princípio central correto e bem declarado.
✅ **Event ledger + projections** — padrão CQRS simplificado adequado ao caso de uso.
✅ **MCF Runtime envia eventos outbound** — elimina problema de firewall/NAT do notebook/VPS.

### 2. Stack tecnológica inicial
✅ **Next.js + TypeScript** — adequado para frontend/backend integrado, facilita server-side.
✅ **Vercel** — deployment rápido, adequado para prova de conceito e fase inicial.
✅ **Supabase/Postgres** — PostgreSQL como storage canônico preserva portabilidade.
✅ **Supabase Realtime** — mecanismo push adequado; polling como fallback declarado.

### 3. Segurança por fases
✅ **Dados públicos GitHub primeiro** — reduz superfície de risco antes de auth.
✅ **Secrets server-side exclusivamente** — correto.
✅ **UI read-only inicial** — decisão prudente, comandos somente após governança.

### 4. Portabilidade futura
✅ **Domínio/contratos TypeScript padrão** — não dependente de runtime proprietário.
✅ **PostgreSQL canônico** — migrations versionados, SQL portável.
✅ **Environment variables** — desacoplamento de URLs/credenciais confirmado.
✅ **Adaptador realtime separado** — camada de abstração preserva domínio.

### 5. Preservação de baseline
✅ **GitPulse e Mission Control preservados** — auditoria E2 confirmou estado funcional conhecido.
✅ **GitPulse LIVE parcial confirmado** — polling de eventos GitHub verificado; métricas com falhas conhecidas (GITPULSE-01, 02, 03).
✅ **Mission Control snapshot estático** — nenhuma evidência de runtime conectado no artefato original.

---

## CORREÇÕES OBRIGATÓRIAS

### BLOCKER-01: Contrato de evento MCF incompleto

**Arquivo:** `MCF-CONTROL-EVENT-v1.md`

**Problema:**
O contrato define envelope e tipos, mas **não especifica payload schemas** para cada `eventType`. Linha 24 mostra `"payload": {}` sem estrutura.

**Impacto:**
- Ingest API não pode validar eventos recebidos além do envelope.
- Projeções não podem ser materializadas sem saber campos disponíveis.
- Runtime e Control Center podem divergir silenciosamente.

**Correção obrigatória:**
Antes de E4, Rafael deve especificar schema de `payload` para **no mínimo** estes eventos críticos:
- `MISSION_CREATED` (nome, descrição, repositório, objetivo)
- `MISSION_STATE_CHANGED` (estado anterior, novo estado, razão)
- `PHASE_STARTED` / `PHASE_COMPLETED` (nome fase, entrada/saída, duração)
- `HANDOFF_CREATED` (agente origem, destino, contexto, artefatos)
- `GATE_OPENED` / `GATE_RESOLVED` (tipo gate, evidências, decisão, autoridade)
- `EVIDENCE_ACCEPTED` / `EVIDENCE_REJECTED` (tipo evidência, resultado verificação, razão rejeição)

**Critério de aceite:**
JSON Schema ou TypeScript interface para cada payload, versionado no contrato.

---

### BLOCKER-02: Schema Postgres ausente

**Arquivo:** `E3-CONTROL-CENTER-ARCHITECTURE.md` linhas 46-69

**Problema:**
Documento lista **nomes de tabelas** mas não define:
- colunas, tipos, constraints;
- chaves primárias e índices;
- relações entre tabelas;
- campos de rastreabilidade LIVE (source, source_event_id, occurred_at, received_at, sha, verification_state).

**Impacto:**
Rafael não pode implementar migrations sem schema concreto. Sem campos de rastreabilidade, regra LIVE (linhas 70-80) não pode ser verificada.

**Correção obrigatória:**
Antes de E4, Rafael deve produzir:
1. **DDL inicial** para todas as tabelas listadas (ledger + projections).
2. **Migration v1** versionada no repositório.
3. **Diagrama ER** mostrando relações críticas (missions ↔ phases ↔ agents ↔ handoffs ↔ gates).

**Exemplo mínimo esperado para `missions`:**

```sql
CREATE TABLE missions (
  id UUID PRIMARY KEY,
  mission_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  repository TEXT,
  commit_sha TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  -- rastreabilidade LIVE
  source TEXT NOT NULL,
  source_event_id UUID REFERENCES source_events(id),
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  verification_state TEXT NOT NULL DEFAULT 'UNVERIFIED'
);
```

**Critério de aceite:**
Migration rodável, testada localmente, commitada no repositório antes de deploy Supabase.

---

### CORREÇÃO-03: Contrato assinatura/autenticação indefinido

**Arquivo:** `MCF-CONTROL-EVENT-v1.md` linha 48, `E3-CONTROL-CENTER-ARCHITECTURE.md` linha 122

**Problema:**
Ambos documentos mencionam "assinatura", "autenticação server-to-server", "secrets server-side", mas **não especificam mecanismo concreto**.

**Impacto:**
- Endpoint `/api/ingest/mcf` pode aceitar eventos forjados se não houver verificação criptográfica.
- Runtime precisa saber qual header/método usar para assinar payload.
- Sem spec, implementações divergem.

**Correção obrigatória:**
Definir **antes de integração runtime**:
1. **Mecanismo escolhido:** HMAC-SHA256 com shared secret, ou JWT assinado, ou mTLS client cert.
2. **Header/formato:** ex. `X-MCF-Signature: sha256=<hex>`, calculado sobre body canônico + timestamp.
3. **Rotação de secret:** como atualizar sem downtime.
4. **Replay protection:** timestamp + janela aceitável (ex. ±5min) ou nonce.

**Recomendação:**
HMAC-SHA256 com `X-MCF-Signature` e `X-MCF-Timestamp`, validação server-side antes de persistir evento.

**Critério de aceite:**
Especificação em contrato versionado + implementação teste unitário da validação.

---

### CORREÇÃO-04: Estratégia de idempotência não detalhada

**Arquivo:** `MCF-CONTROL-EVENT-v1.md` linha 45

**Problema:**
Contrato declara `eventId` deve ser idempotente, mas não especifica:
- Como `eventId` é gerado (UUID v4? v5 baseado em conteúdo? ulid?)
- Como ingest detecta duplicata (unique constraint? cache? bloom filter?)
- O que acontece quando duplicata chega (201 aceito? 200 já existia? 409 conflito?)

**Impacto:**
Runtime pode reenviar evento legítimo (retry de rede) e Control Center pode:
- criar entrada duplicada (corrompe ledger);
- rejeitar evento válido (perde dado);
- responder ambiguamente (runtime não sabe se persistiu).

**Correção obrigatória:**
Antes de E4, definir:
1. **Formato `eventId`:** UUID v5 baseado em (missionId + eventType + occurredAt + nonce-determinístico), ou ulid monotônico.
2. **Detecção:** unique constraint em `source_events(event_id)`.
3. **Resposta HTTP:** `201 Created` (novo), `200 OK` (duplicata aceita anteriormente, retorna receipt existente).

**Critério de aceite:**
Teste de integração que envia mesmo evento 2x e verifica ledger contém 1 linha + ambas respostas HTTP retornam receipt idêntico.

---

## RISCOS

### RISCO-01: GitHub webhook não configurado inicialmente
**Severidade:** MÉDIA
**Descrição:** Arquitetura descreve webhook (linhas 91-99) mas estratégia de entrega (linhas 148-157) não menciona configuração GitHub App/webhook antes de E4.
**Mitigação:** Preservar polling GitPulse como baseline funcional até webhook estar operacional. Documentar passo de criação GitHub webhook em runbook E4.

### RISCO-02: Supabase Realtime latência/custo
**Severidade:** BAIXA
**Descrição:** Realtime cobra por conexão simultânea. Múltiplas abas/usuários podem exceder tier gratuito rapidamente.
**Mitigação:** Implementar polling fallback desde início (já declarado linha 44). Monitorar uso Supabase antes de escalar convites.

### RISCO-03: Rate limit GitHub API pública
**Severidade:** MÉDIA (conhecida de E2)
**Descrição:** GitPulse baseline usa API pública sem auth (60 req/hora/IP). E2 identificou como GITPULSE-04.
**Mitigação:** Backend server-side deve usar GitHub Personal Access Token ou GitHub App com rate limit 5000 req/hora. Não expor token no frontend.

### RISCO-04: Migração futura VPS subestimada
**Severidade:** BAIXA
**Descrição:** Documento assume portabilidade simples (linhas 128-145), mas omite complexidade de:
- self-host Supabase Realtime (Elixir/Phoenix, não trivial);
- replicação Postgres failover;
- certificados SSL/domínio;
- CI/CD próprio.

**Mitigação:** Não é blocker para E3/E4. Documentar dependências Supabase-specific antes de migração. Considerar Supabase self-hosted ou substituir Realtime por Server-Sent Events padrão.

### RISCO-05: Falta auditoria de segurança independente
**Severidade:** MÉDIA
**Descrição:** Arquitetura menciona autenticação/secrets mas nenhum gate de revisão de segurança antes de habilitar comandos (linha 157 "somente depois habilitar comandos").
**Mitigação:** Escalar para Emily auditoria de suficiência quando auth for implementado e antes de habilitar qualquer endpoint de escrita/comando.

---

## CRITÉRIOS DE INTEGRAÇÃO

Antes de declarar E4 concluído e permitir integração runtime-to-control em ambiente não-local, as seguintes condições devem ser satisfeitas:

### Pré-requisitos técnicos
1. ✅ **Schema Postgres completo** commitado e aplicado (BLOCKER-02).
2. ✅ **Payload schemas MCF** definidos para eventos críticos (BLOCKER-01).
3. ✅ **Mecanismo assinatura** especificado e implementado (CORREÇÃO-03).
4. ✅ **Idempotência** testada com evento duplicado (CORREÇÃO-04).
5. ✅ **GitHub backend server-side** usando token autenticado, não API pública (RISCO-03).

### Verificação funcional
6. ✅ **Ingest API** aceita evento MCF válido, persiste em `source_events`, atualiza projeção, retorna receipt.
7. ✅ **Ingest API** rejeita evento com assinatura inválida (401/403).
8. ✅ **Ingest API** aceita evento duplicado idempotente (200 + receipt existente).
9. ✅ **UI Control Center** renderiza projeção com rastreabilidade LIVE verificável (source, event_id, occurred_at, received_at exibidos ou auditáveis).
10. ✅ **Realtime ou polling** propaga mudança de projeção para UI sem refresh manual.

### Gates de segurança
11. ✅ **Nenhum secret** commitado no repositório público.
12. ✅ **Variáveis ambiente** documentadas em `.env.example` sem valores reais.
13. ✅ **Endpoint público** (se houver) expõe somente dados GitHub públicos até auth estar ativo.
14. 🔒 **Auditoria de segurança** por Emily antes de habilitar comandos de escrita (fora de E4, gate de fase futura).

---

## HANDOFF PARA RAFAEL

**De:** SOFIA (Arquitetura de Software)
**Para:** RAFAEL (Engenharia de Software)
**Missão:** MCF-CONTROL-CENTER-001
**Transição:** E3 → E4

### Contexto
Arquitetura E3 foi aprovada com correções obrigatórias. Stack e design estrutural estão sólidos. Portabilidade futura preservada.

### Decisões arquiteturais vinculantes para E4

1. **Event ledger é imutável.** Nenhuma operação UPDATE ou DELETE em `source_events`. Correção de dado via evento compensatório.

2. **Projeções são derivadas.** Tabelas de projeção (missions, phases, agents, etc.) são materializadas a partir de eventos. Se houver inconsistência, reconstruir projeção a partir do ledger.

3. **Regra LIVE é obrigatória.** Todo campo marcado LIVE no UI deve ter `source`, `source_event_id`, `occurred_at`, `received_at`, `verification_state` rastreáveis. Se origem indisponível, UI exibe `STALE`/`DEGRADED`/`UNKNOWN`.

4. **Ingest API falha fechada.** Schema inválido, assinatura ausente/incorreta, replay fora de janela → rejeitar com 4xx, não persistir evento malformado.

5. **GitHub backend server-side.** Baseline GitPulse polling pode ser preservado como fallback, mas produção deve usar webhook + GitHub token autenticado no backend, não API pública do frontend.

6. **Secrets exclusivamente server-side.** Nenhum token, API key, database password no código frontend ou variável exposta ao browser.

7. **Migrations versionadas.** Todo schema change via migration numerada e commitada. Rollback deve ser possível (ou documentado como irreversível com procedimento manual).

8. **Adaptador Realtime isolado.** Camada de domínio não deve importar diretamente `@supabase/supabase-js` Realtime. Criar interface abstrata para permitir substituição futura por SSE/WebSocket padrão.

### Artefatos obrigatórios antes de integração runtime

**BLOCKER-01 — Payload schemas MCF:**
- JSON Schema ou TypeScript interface para cada `eventType` listado em `MCF-CONTROL-EVENT-v1.md`.
- No mínimo: `MISSION_CREATED`, `MISSION_STATE_CHANGED`, `PHASE_STARTED`, `PHASE_COMPLETED`, `HANDOFF_CREATED`, `GATE_OPENED`, `GATE_RESOLVED`, `EVIDENCE_ACCEPTED`, `EVIDENCE_REJECTED`.
- Commitar em `docs/contracts/MCF-CONTROL-EVENT-v1.md` atualizado ou arquivo separado `MCF-EVENT-PAYLOADS-v1.md`.

**BLOCKER-02 — Schema Postgres:**
- DDL completo para todas as tabelas: `source_events`, `ingest_receipts`, `missions`, `mission_phases`, `agents`, `skills`, `mission_assignments`, `handoffs`, `gates`, `evidence_receipts`, `runtime_snapshots`, `github_repositories`, `github_pull_requests`, `github_issues`, `github_releases`, `github_activity`.
- Campos de rastreabilidade LIVE em todas as projeções: `source`, `source_event_id`, `occurred_at`, `received_at`, `verification_state`.
- Chaves primárias, foreign keys, índices críticos (ex. `source_events(event_id)` unique, `missions(mission_code)` unique).
- Diagrama ER para relações entre missions/phases/agents/handoffs/gates.
- Migration inicial `001_initial_schema.sql` commitada em `db/migrations/`.

**CORREÇÃO-03 — Autenticação/assinatura:**
- Especificar mecanismo: recomendo HMAC-SHA256 com `X-MCF-Signature` e `X-MCF-Timestamp`.
- Documentar formato header, algoritmo hash, janela replay aceitável (ex. ±5min).
- Implementar validação server-side em `/api/ingest/mcf` antes de persistir evento.
- Teste unitário de assinatura válida/inválida/expirada.

**CORREÇÃO-04 — Idempotência:**
- Especificar formato `eventId`: UUID v5 ou ulid.
- Implementar unique constraint `source_events(event_id)`.
- Definir resposta HTTP: `201 Created` (novo) vs `200 OK` (duplicata, retorna receipt existente).
- Teste de integração enviando mesmo evento 2x, verificar ledger contém 1 linha.

### Falhas conhecidas do baseline (de E2)
- **GITPULSE-01:** card Issues conta PRs também. Corrigir consultando `GET /repos/{owner}/{repo}/issues?state=open` filtrado.
- **GITPULSE-02:** card Commits mostra watchers. Renomear ou implementar contagem commits real (GitHub API `GET /repos/{owner}/{repo}/commits?since=<30d>`).
- **GITPULSE-03:** polling parcial (só eventos). Backend deve reconciliar PRs/releases periodicamente ou via webhook.
- **GITPULSE-04:** API pública rate limit. Backend deve usar GitHub PAT ou App.

### Estratégia de entrega recomendada

**Fase 1 — Fundação (E4 mínimo viável):**
1. Setup Vercel project + Supabase project + environment variables.
2. Aplicar migration inicial Postgres.
3. Implementar `/api/ingest/mcf` com validação schema + assinatura + idempotência.
4. Teste manual: enviar evento `MISSION_CREATED` via `curl`, verificar `source_events` e projeção `missions`.
5. Implementar UI shell Control Center renderizando projeções Postgres (sem Realtime ainda).
6. Verificar rastreabilidade LIVE exibida no UI (source, event_id, timestamps).

**Fase 2 — GitHub integração:**
7. Implementar `/api/ingest/github` recebendo webhook payload GitHub.
8. Configurar webhook no repositório `leon337/multiagent-collaboration-framework`.
9. Mapear eventos GitHub (push, pull_request, issues, release) para `source_events` + projeções GitHub.
10. Preservar baseline GitPulse como módulo separado, apontar para projeções backend em vez de API pública frontend.
11. Corrigir GITPULSE-01, 02, 03, 04.

**Fase 3 — Realtime:**
12. Ativar Supabase Realtime nas tabelas de projeção relevantes.
13. Implementar adaptador abstrato (interface TypeScript) isolando lógica Supabase.
14. Conectar UI a subscriptions Realtime.
15. Testar: criar evento no backend, verificar UI atualiza sem refresh.
16. Implementar polling fallback caso Realtime falhe.

**Fase 4 — Autenticação (fora de E4, gate de fase futura):**
17. Implementar Supabase Auth ou NextAuth.
18. Proteger endpoints sensíveis e dados operacionais MCF.
19. **Escalar para Emily** auditoria de segurança antes de habilitar comandos.

### Critérios de aceite E4
- ✅ Todos os BLOCKERS resolvidos e commitados.
- ✅ Ingest API aceitando evento MCF válido e rejeitando inválido.
- ✅ UI renderizando projeção com rastreabilidade LIVE.
- ✅ GitHub webhook configurado e eventos persistindo.
- ✅ Baseline GitPulse integrado ao backend (não API pública frontend).
- ✅ Realtime ou polling propagando mudanças sem refresh manual.
- ✅ Nenhum secret commitado, `.env.example` documentado.
- ✅ README atualizado com instruções setup local Vercel + Supabase.

### Riscos delegados a Rafael validar
- **RISCO-02:** monitorar uso Supabase Realtime tier gratuito.
- **RISCO-04:** documentar dependências Supabase-specific para futura migração VPS.

### Pergunta arquitetural em aberto
**Não bloqueia E4**, mas Rafael deve considerar:

- **Reconciliação periódica GitHub:** se webhook falhar ou evento for perdido, como detectar divergência entre GitHub real e projeções Control Center? Recomendo job diário que consulta GitHub API e compara checksums (ex. último SHA de cada PR, último evento timestamp) sem sobrescrever ledger, gerando alerta de inconsistência.

---

**Status E3:** APROVADO COM CORREÇÕES OBRIGATÓRIAS
**Próximo responsável:** RAFAEL (Engenharia de Software)
**Próxima etapa:** E4 — Implementação Vercel + Supabase
**Retorno a:** MESTRE/LÉO para coordenação de continuidade

---

**SOFIA · Arquitetura de Software · MCF**
*2026-09-02T19:23:51Z*
