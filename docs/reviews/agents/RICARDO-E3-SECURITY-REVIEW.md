Entendido. Apresentarei a revisão de segurança completa no chat.

---

# REVISÃO DE SEGURANÇA — MCF-CONTROL-CENTER-001 / E3 → E4
**Agente:** RICARDO (Segurança)
**Artefatos analisados:**
- `agents/RICARDO.md` (contrato normativo)
- `source/E3-CONTROL-CENTER-ARCHITECTURE.md`
- `source/MCF-CONTROL-EVENT-v1.md`
- `handoff/SOFIA-E3-ARCHITECTURE-REVIEW.md`
- `handoff/RAFAEL-E3-ENGINEERING-REVIEW.md`

---

## 1. VEREDITO DE SEGURANÇA

### Status Final: **APROVADO COM CORREÇÕES CRÍTICAS OBRIGATÓRIAS**

A arquitetura proposta é defensável sob o domínio de segurança, mas a especificação original de BLOCKER-1 (assinatura/replay) da SOFIA é **insuficiente e insegura**. As correções de RAFAEL são **corretas e obrigatórias** antes da E4.

### Decisões de Segurança Principais

| Decisão | Status | Justificativa |
|---------|--------|---------------|
| Assinatura HMAC sobre corpo bruto | **OBRIGATÓRIA** | Protege `payload`, `commitSha`, `phaseId`, `evidenceRef` — MITM poderia mutar payload mantendo assinatura se subconjunto |
| Janela de replay baseada em timestamp de transporte | **OBRIGATÓRIA** | `occurredAt` sujeito a skew de relógio; timestamp de transporte calculado no receptor elimina vulnerabilidade |
| Assinatura para TODOS os eventTypes | **OBRIGATÓRIA** | Caminho "assinatura opcional" cria superfície de abuso e pode permitir injeção de dados MCF não autenticados |
| Enforced append-only no ledger | **OBRIGATÓRIA** | Impede manipulação de histórico; auditoria depende de imutabilidade |
| `raw_body` + `signature_status` (enum) | **OBRIGATÓRIA** | Permite re-verificação offline e distinção clara entre "não assinado", "assinado válido", "assinado inválido" |
| `ingest_receipts` explícito | **OBRIGATÓRIA** | Requisito do contrato ("cada evento gera receipt de aceitação/rejeição") — sem isso, auditoria falha |

### Risco Residual Estimado: **MODERADO**

Com as correções aplicadas, o risco residual é aceitável para fase inicial (read-only), mas exigirá monitoramento contínuo de:
- Volume de `source_events` (explosão de JSONB)
- Rotinas de rotação de segredos
- Integração com GitHub webhooks (frequência e integridade)
- Degradação de Realtime e fallback de polling

---

## 2. THREAT MODEL E FRONTEIRAS DE CONFIANÇA

### 2.1 Fronteiras de Confiança

```
┌─────────────────────────────────────────────────────────────┐
│                     TRUSTED DOMAIN                           │
│  - MCF Runtime (127.0.0.1:3000)                              │
│  - GitHub (webhooks, API)                                   │
│  - Supabase (Postgres + Realtime)                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     UNTRUSTED DOMAIN                         │
│  - Client browsers (Vercel)                                 │
│  - Internet (MITM, DDoS, replay attacks)                    │
│  - Malicious GitHub webhooks (if not validated)             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     UNTRUSTED DOMAIN                         │
│  - User actions (command buttons) — somente após auth      │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Ameaças Identificadas

| Ameaça | Origem | Probabilidade | Impacto | Controle Atual | Controle Obrigatório |
|--------|--------|---------------|---------|----------------|---------------------|
| Replay attack (reenvio de evento) | MITM | ALTA (se não bloqueado) | Duplicação de eventos, estado inconsistente | **NENHUM** (ausente) | **BLOCKER-1 corrigido** |
| MITM alterando payload sem detectar | MITM | ALTA (se subconjunto) | Dados corrompidos, missões iniciadas com parâmetros inválidos | **NENHUM** (ausente) | **BLOCKER-1 corrigido** |
| Injeção de eventos MCF falsos | Malicious actor | MÉDIA | Estado controlado, missões manipuladas | **NENHUM** (ausente) | **BLOCKER-1 corrigido** |
| Injeção de eventos GitHub falsos | Malicious actor | MÉDIA | Métricas falsificadas, dashboard enganoso | **NENHUM** (ausente) | **BLOCKER-2 corrigido** |
| Manipulação de ledger (UPDATE/DELETE) | Comprometido DB | BAIXA | Auditoria corrompida, histórico perdido | **NENHUM** (ausente) | **BLOCKER-2 corrigido** |
| Divergência entre projeções e payload | Implementação errada | MÉDIA | Estado inconsistente, auditoria falha | **NENHUM** (ausente) | **BLOCKER-2 corrigido** |
| Exposição de segredos no bundle cliente | Bug dev | BAIXA | Segredos vazados para browser | **NENHUM** (ausente) | **CONTROLE OBRIGATÓRIO E4** |
| Rate limit abuse | DDoS / abuso | MÉDIA | Serviço indisponível | **NENHUM** (ausente) | **CONTROLE OBRIGATÓRIO E4** |
| Realtime compromise (MITM) | MITM | BAIXA | Dados de missão interceptados | **NENHUM** (ausente) | **CONTROLE OBRIGATÓRIO E4** |

### 2.3 Threat Model Detalhado por Componente

#### 2.3.1 MCF Runtime → Control Center (`/api/ingest/mcf`)

**Trust Boundary:** MCF Runtime (trusted) ↔ Internet (untrusted)

**Ameaças:**
1. **Replay attack:** Ator malicioso captura envelope assinado e reenvia com `occurredAt` novo (dentro de janela). Sem nonce/timestamp de transporte, não há proteção.
2. **MITM alterando payload:** Ator intercepta e altera `payload`, `commitSha`, `phaseId`, `evidenceRef` mantendo assinatura válida se HMAC for sobre subconjunto.
3. **Injeção de eventos falsos:** Ator sem acesso ao MCF Runtime pode enviar envelopes falsos com `source: "mcf-runtime"`.

**Controles Atuais:** **NENHUM** — BLOCKER-1 não especificado.

**Controles Obrigatórios (correção RAFAEL):**
- HMAC-SHA256 sobre corpo bruto + timestamp de transporte
- Janela de replay baseada em `t` (timestamp de transporte) ≤ 5 minutos
- Assinatura para TODOS os eventTypes (sem caminho "opcional")
- Rotação de segredo com sobreposição (current + previous)
- Idempotência por `event_id` (linha única no ledger)
- Log/audit de `raw_body`, `received_at`, `t`, `signature_status`

**Vulnerabilidade se não implementado:** **CRÍTICO** — Qualquer ator com acesso à URL pode controlar estado do Control Center.

---

#### 2.3.2 GitHub → Control Center (`/api/webhooks/github`)

**Trust Boundary:** GitHub (trusted) ↔ Internet (untrusted)

**Ameaças:**
1. **Falsificação de webhook:** Ator malicioso pode falsificar assinatura `X-Hub-Signature-256` se não validada corretamente.
2. **Replay de webhook:** GitHub delivery ID não garante exclusividade (delivery pode ser reenviado).
3. **Injeção de dados GitHub falsos:** Ator pode enviar eventos falsos com dados de PR/issues falsos.

**Controles Atuais:** **PARCIAL** — SOFIA menciona validação de assinatura, mas não especifica detalhes. RAFAEL propõe idempotência por `X-GitHub-Delivery`.

**Controles Obrigatórios (correção RAFAEL):**
- Validação `X-Hub-Signature-256` usando raw body de GitHub
- Idempotência por `X-GitHub-Delivery` (UUID único por delivery)
- Mapeamento explícito GitHub → `event_type` (ex: `pull_request.opened` → `github:pull_request.opened`)
- Append-only enforcement (mesma regra de BLOCKER-2)

**Vulnerabilidade se não implementado:** **ALTO** — Dashboard pode exibir métricas falsificadas.

---

#### 2.3.3 Supabase Realtime

**Trust Boundary:** Supabase (trusted) ↔ Client browsers (untrusted)

**Ameaças:**
1. **MITM interceptando mensagens:** Qualquer ator com acesso ao WebSocket pode ler eventos em tempo real.
2. **Spoofing de mensagens:** Ator malicioso pode enviar mensagens falsas se autenticação não for aplicada no lado do servidor.

**Controles Atuais:** **NENHUM** — Realtime é push-only sem autenticação de mensagem.

**Controles Obrigatórios (correção RAFAEL):**
- Fallback de polling quando Realtime falha (heartbeat >30s)
- Banner "Modo Degradado — Realtime indisponível"
- Reconexão automática exponencial (5s, 10s, 20s, max 60s)
- Adaptação de Realtime isolado (`lib/realtime-adapter.ts`)

**Vulnerabilidade se não implementado:** **MODERADO** — Perda de funcionalidade, não segurança crítica, mas impacta experiência.

---

#### 2.3.4 Ledger (`source_events`)

**Trust Boundary:** Supabase (trusted) ↔ Application code (untrusted)

**Ameaças:**
1. **Manipulação de histórico:** UPDATE/DELETE em `source_events` corrompe auditoria.
2. **Divergência entre projeções e payload:** Colunas promovidas podem ser atualizadas diretamente, enquanto `payload` permanece inalterado.
3. **Perda de dados:** Nenhum TTL/particionamento pode levar a explosão de volume.

**Controles Atuais:** **NENHUM** — BLOCKER-2 não especificado.

**Controles Obrigatórios (correção RAFAEL):**
- `raw_body` (bytes exatos) para re-verificação offline
- `signature_status` enum (`verified`, `failed`, `not_required`)
- `ingest_receipts` tabela explícita
- Append-only enforcement (trigger REVOKE UPDATE/DELETE)
- Regra anti-drift: colunas promovidas derivadas do `body`
- Índices otimizados (`occurred_at DESC`, `source`, `event_type`)
- `created_at` como chave candidata para particionamento futuro

**Vulnerabilidade se não implementado:** **CRÍTICO** — Auditoria comprometida, histórico manipulável, divergência de estado.

---

#### 2.3.5 Supabase Auth/RLS/service_role

**Trust Boundary:** Application code ↔ Supabase (untrusted)

**Ameaças:**
1. **Abuso de service_role:** Se service_role for exposto no bundle cliente, qualquer pessoa pode ler/escrever dados.
2. **Bypass de RLS:** Se RLS não estiver configurado corretamente, dados sensíveis podem ser lidos por usuários não autorizados.

**Controles Atuais:** **PARCIAL** — SOFIA menciona "secrets ficam exclusivamente em variáveis server-side", mas não especifica RLS.

**Controles Obrigatórios (CONTROLE E4):**
- **Nenhum secret no bundle cliente** (build-time check)
- **RLS configurado em todas as tabelas sensíveis** (missions, gates, handoffs, evidence_receipts)
- **service_role SOLO para backend** (não no cliente)
- **env vars em `.env`** (não hardcoded)
- **README com `.env.example` documentado**

**Vulnerabilidade se não implementado:** **CRÍTICO** — Exposição de dados operacionais do MCF para qualquer usuário.

---

#### 2.3.6 Vercel secrets/env e exposição cliente/servidor

**Trust Boundary:** Vercel (untrusted) ↔ Application code

**Ameaças:**
1. **Exposição de segredos no frontend:** Se `.env` for exposto no bundle do cliente, segredos vazam.
2. **Segredos expostos em logs:** Logs de deploy podem conter secrets.
3. **Segredos expostos em metadata:** Vercel pode expor env vars em metadata de deploy.

**Controles Atuais:** **PARCIAL** — SOFIA menciona "nenhum secret no browser", mas não especifica proteção de logs/metadata.

**Controles Obrigatórios (CONTROLE E4):**
- **Build-time check** para garantir nenhum secret no bundle cliente (lint script)
- **Nenhum secret em logs** (configuração de logging)
- **Segredos em `.env`** (não hardcoded)
- **README com `.env.example`** (documentação)

**Vulnerabilidade se não implementado:** **ALTO** — Segredos vazados, comprometimento de sistema.

---

#### 2.3.7 HUMAN_GATE / autoridade de LEANDRO

**Trust Boundary:** LEANDRO (trusted) ↔ UI/cockpit (untrusted)

**Ameaças:**
1. **Bypass de HUMAN_GATE:** UI pode simular decisão de LEANDRO sem autenticação.
2. **Exposição de dados de autenticação:** Token de sessão ou credenciais podem ser expostos no frontend.

**Controles Atuais:** **PARCIAL** — SOFIA menciona "HUMAN_GATE deve manter proveniência de autoridade, sem expor dados de autenticação", mas não especifica como.

**Controles Obrigatórios (CONTROLE E4):**
- **Comandos nunca escrevem diretamente no banco** — sempre atravessam boundary governado do MCF
- **Receipt verificável** para todas as ações de comando
- **Dados de autenticação SOLO no backend** (JWT/cookie)
- **UI lê-only** — não contém lógica de autorização
- **Sessão obrigatória** para dados operacionais do MCF

**Vulnerabilidade se não implementado:** **MODERADO** — Controle de missões pode ser bypassado.

---

#### 2.3.8 Rate limiting, abuso e validação de payload

**Trust Boundary:** Internet ↔ Application code

**Ameaças:**
1. **DoS por webhook spam:** GitHub webhooks podem ser enviados em rajada, sobrecarregando ingest.
2. **DoS por MCF Runtime spam:** Runtime pode enviar eventos em alta frequência.
3. **Abuso de API:** Ator malicioso pode tentar injeção de payloads maliciosos.

**Controles Atuais:** **NENHUM** — Não especificado.

**Controles Obrigatórios (CONTROLE E4):**
- **Rate limiting em `/api/ingest/mcf`** (ex: 100 eventos/min por IP)
- **Rate limiting em `/api/webhooks/github`** (ex: 10 webhooks/min por IP)
- **Validação de schema** (rejeita eventos com campos inválidos)
- **Limites de tamanho de payload** (ex: 1MB máximo)
- **Limites de tamanho de webhook** (ex: 10MB máximo)

**Vulnerabilidade se não implementado:** **MODERADO** — DoS possível, mas não critical para fase inicial.

---

## 3. BLOCKER-1 — ASSINATURA / REPLAY — VALIDADO, RECLASSIFICADO OU REJEITADO

### Verdicto: **REJEITADO** (especificação original) → **APROVADO** (correção RAFAEL)

### 3.1 Especificação Original da SOFIA (REJEITADA)

**Localização:** `handoff/SOFIA-E3-ARCHITECTURE-REVIEW.md`, linha 56-61

**Problemas Críticos:**

1. **Subconjunto de HMAC:** HMAC sobre `eventId|occurredAt|eventType|missionId` **NÃO protege `payload`, `phaseId`, `commitSha`, `evidenceRef`**. MITM pode alterar esses campos mantendo assinatura válida.

   **Fato observado:** A SOFIA propõe HMAC sobre subconjunto.
   **Hipótese:** A SOFIA subestima a superfície de ataque ao payload.

2. **Janela de replay baseada em `occurredAt`:** `occurredAt` é timestamp de negócio da origem, sujeito a skew de relógio. Replay baseado nele pode permitir ataques com relógios desincronizados.

   **Fato observado:** A SOFIA propõe janela de 5 minutos baseada em `occurredAt` vs. `receivedAt`.
   **Hipótese:** A SOFIA ignora o problema de clock skew entre MCF Runtime e Control Center.

3. **Assinatura opcional para eventos públicos:** Criar dois caminhos (assinado vs. não assinado) cria superfície de confusão e pode permitir injeção de dados MCF não autenticados.

   **Fato observado:** A SOFIA sugere "eventTypes sensíveis DEVEM ser assinados vs. públicos opcionais".
   **Hipótese:** A SOFIA confunde autenticação (assinatura) com autorização (leitura), criando vulnerabilidade.

4. **Falta rotação de segredo:** Não especifica procedimento de rotação, o que é crítico para segurança a longo prazo.

   **Fato observado:** A SOFIA menciona "procedimento de rotação de secret" mas não detalha.
   **Hipótese:** A SOFIA assume que rotação é trivial, mas procedimento correto exige sobreposição temporal.

### 3.2 Correção de RAFAEL (APROVADA)

**Localização:** `handoff/RAFAEL-E3-ENGINEERING-REVIEW.md`, linha 73-106

**Decisões de Segurança Aplicadas:**

1. **HMAC sobre corpo bruto + timestamp de transporte:**
   ```
   MAC = HMAC-SHA256( secret, "t=<epoch_ms>\n" + rawBody )
   ```
   **Por que funciona:** Cobertura total do payload, timestamp de transporte calculado no receptor elimina clock skew.

2. **Janela de replay baseada em `t` (timestamp de transporte):**
   - Receptor calcula `|now() - t| <= 5min`
   - `occurredAt` permanece timestamp de negócio, não usado para replay
   **Por que funciona:** Elimina dependência de clock skew.

3. **Assinatura para TODOS os eventTypes:**
   - Sem caminho "assinatura opcional"
   - Sensibilidade resolvida na camada de leitura/auth, não na ingest
   **Por que funciona:** Elimina superfície de abuso, simplifica código.

4. **Rotação de segredo com sobreposição:**
   - Envs: `MCF_RUNTIME_SIGNING_SECRET` + `MCF_RUNTIME_SIGNING_SECRET_PREVIOUS`
   - Validação tenta `current` e, em falha, `previous`
   - Janela de rotação onde ambos aceitos
   **Por que funciona:** Permite rotação sem downtime, sem perda de eventos.

5. **Idempotência por `event_id`:**
   - `event_id` UNIQUE no ledger
   - Replay de evento já entregue → retorna receipt anterior (no-op)
   **Por que funciona:** Reenvio não duplica, mas também não falha.

### 3.3 Decisão Final

| Item | Decisão | Justificativa |
|------|---------|---------------|
| Especificação original da SOFIA | **REJEITADA** | Insegura, não protege payload completo, depende de clock skew |
| Correção de RAFAEL | **APROVADA** | Correge todos os problemas críticos, implementa controles adequados |
| Implementação de `/api/ingest/mcf` | **BLOQUEADA** até correção aplicada | Sem isso, qualquer ator com acesso à URL pode controlar estado |
| Implementação de `/api/webhooks/github` | **ACEITA** (independente) | Pode ser iniciada em paralelo, não depende de BLOCKER-1 |

---

## 4. BLOCKER-2 — LEDGER / SCHEMA — IMPACTO DE SEGURANÇA

### Verdicto: **APROVADO** (com correções de RAFAEL)

### 4.1 Especificação Original da SOFIA (PARCIALMENTE APROVADA)

**Localização:** `handoff/SOFIA-E3-ARCHITECTURE-REVIEW.md`, linha 78-106

**Pontos Fortes:**
- Schema básico de `source_events` com colunas essenciais
- Índices para performance (`occurred_at DESC`, `event_type`, `mission_id`)
- Tabela `ingest_receipts` listada (mas não especificada)

**Pontos Fracos:**
- **Falta `raw_body`** para re-verificação offline
- **Falta `signature_status` enum** (booleano não distingue "assinado inválido" de "não assinado")
- **Falta enforcement de append-only** (não impede UPDATE/DELETE)
- **Falta regra anti-drift** (colunas podem divergir de `payload`)
- **`ingest_receipts` não especificada** (apenas listada)
- **Falta particionamento/TTL** (explosão de volume não tratada)

### 4.2 Correção de RAFAEL (APROVADA)

**Localização:** `handoff/RAFAEL-E3-ENGINEERING-REVIEW.md`, linha 114-181

**Decisões de Segurança Aplicadas:**

1. **`raw_body` (TEXT):**
   - Armazena bytes exatos recebidos
   - Permite re-verificação offline (sem acesso ao segredo)
   - **Por que funciona:** Auditoria pode validar integridade sem depender de segredo em runtime.

2. **`signature_status` enum (`verified`, `failed`, `not_required`):**
   - Distingue claramente entre "assinado válido", "assinado inválido", "não assinado"
   - **Por que funciona:** A auditoria da Emily precisa saber se evento foi assinado e se a assinatura é válida.

3. **`ingest_receipts` explícito:**
   - Tabela separada para receipts de aceitação/rejeição
   - **Por que funciona:** Requisito do contrato ("cada evento gera receipt"), sem isso auditoria falha.

4. **Append-only enforcement:**
   - Trigger `trg_source_events_append_only` REJECT UPDATE/DELETE
   - **Por que funciona:** Impede manipulação de histórico, garantindo integridade de auditoria.

5. **Regra anti-drift:**
   - Colunas promovidas (mission_id, etc.) derivadas do `body` no servidor
   - **Por que funciona:** Evita divergência entre projeções e payload.

6. **Índices otimizados:**
   - `occurred_at DESC` para queries de timeline
   - `source`, `event_type` para filtros
   - `mission_id` parcial para queries por missão
   **Por que funciona:** Performance adequada sem sacrificar segurança.

### 4.3 Decisão Final

| Item | Decisão | Justificativa |
|------|---------|---------------|
| Schema básico da SOFIA | **PARCIAL** | Adequado como base, mas insuficiente para segurança |
| Correção de RAFAEL | **APROVADA** | Adiciona todos os controles necessários para auditoria e integridade |
| Implementação de ledger | **BLOQUEADA** até correção aplicada | Sem isso, auditoria é comprometida |
| Implementação de GitHub webhook | **ACEITA** (independente) | Pode ser iniciada em paralelo, não depende de BLOCKER-2 |

---

## 5. NOVOS BLOCKERS E NÃO-BLOCKERS

### 5.1 Novos Blockers (Identificados)

**NENHUM** — Todos os blockers críticos já foram identificados por SOFIA e RAFAEL. Não há novos blockers não detectados.

### 5.2 Não-Blockers (Validados)

| Item | Status | Justificativa |
|------|--------|---------------|
| Projeções MCF não especificadas (NÃO-BLOCKER-1) | **ACEITO** (não-blocker) | Não bloqueia início de E4, depende de sequência para integração MCF |
| Preservação GitPulse (NÃO-BLOCKER-2) | **ACEITO** (pré-requisito de ordem) | Tag `gitpulse-baseline-v1` antes de qualquer mutação, mas não bloqueia E4 |
| Reconciliação GitHub (NÃO-BLOCKER-3) | **ACEITO** (não-blocker) | Safety net futuro, não crítica para E4 |
| Realtime fallback (NÃO-BLOCKER-4) | **ACEITO** (não-blocker) | Melhora experiência, não segurança crítica |
| Boundary de comandos futuro (NÃO-BLOCKER-5) | **ACEITO** (não-blocker) | Comandos fora de scope de E3 |

### 5.3 Reclassificações

**Nenhuma reclassificação** — Todos os blockers identificados por SOFIA e RAFAEL são válidos. Nenhum não-blocker vira blocker.

---

## 6. CONTROLES OBRIGATÓRIOS PARA E4

### 6.1 Controles de Segurança Críticos (BLOCKER-1/2)

| Controle | Artefato | Prioridade | Implementação |
|----------|----------|------------|---------------|
| HMAC-SHA256 sobre corpo bruto + timestamp de transporte | RAFAEL §4.1 | **CRÍTICO** | `MCF_RUNTIME_SIGNING_SECRET` env var, header `X-MCF-Signature` |
| Janela de replay baseada em timestamp de transporte | RAFAEL §4.2 | **CRÍTICO** | `|now() - t| <= 5min` |
| Assinatura para TODOS os eventTypes | RAFAEL §4.3 | **CRÍTICO** | Sem caminho "assinatura opcional" |
| Rotação de segredo com sobreposição | RAFAEL §4.4 | **CRÍTICO** | `MCF_RUNTIME_SIGNING_SECRET` + `PREVIOUS` |
| `raw_body` em `source_events` | RAFAEL §5.1 | **CRÍTICO** | Armazena bytes exatos |
| `signature_status` enum | RAFAEL §5.1 | **CRÍTICO** | `verified`, `failed`, `not_required` |
| `ingest_receipts` explícito | RAFAEL §5.3 | **CRÍTICO** | Tabela com outcome enum |
| Append-only enforcement | RAFAEL §5.4 | **CRÍTICO** | Trigger REJECT UPDATE/DELETE |
| Regra anti-drift (colunas derivadas do `body`) | RAFAEL §5.2 | **CRÍTICO** | Projeções reconstruídas a partir do ledger |
| Idempotência por `event_id` | RAFAEL §4.2 | **ALTO** | `event_id` UNIQUE, retorna receipt anterior |

### 6.2 Controles de Segurança Obrigatórios (CONTROLE E4)

| Controle | Artefato | Prioridade | Implementação |
|----------|----------|------------|---------------|
| Nenhum secret no bundle cliente | SOFIA §2.6 | **CRÍTICO** | Build-time check, `.env.example` |
| RLS configurado em todas as tabelas sensíveis | SOFIA §2.6 | **CRÍTICO** | missions, gates, handoffs, evidence_receipts |
| service_role SOLO para backend | SOFIA §2.6 | **CRÍTICO** | Não exposto no cliente |
| Rate limiting em `/api/ingest/mcf` | SOFIA §2.6 | **ALTO** | 100 eventos/min por IP |
| Rate limiting em `/api/webhooks/github` | SOFIA §2.6 | **ALTO** | 10 webhooks/min por IP |
| Validação de schema | SOFIA §2.6 | **ALTO** | Rejeita eventos com campos inválidos |
| Limites de tamanho de payload | SOFIA §2.6 | **MÉDIO** | 1MB máximo |
| Limites de tamanho de webhook | SOFIA §2.6 | **MÉDIO** | 10MB máximo |
| Fallback de polling quando Realtime falha | RAFAEL §NÃO-BLOCKER-4 | **MÉDIO** | Heartbeat >30s, polling a cada 10s |
| Banner "Modo Degradado" | RAFAEL §NÃO-BLOCKER-4 | **BAIXO** | Melhora experiência |
| Reconexão automática exponencial | RAFAEL §NÃO-BLOCKER-4 | **BAIXO** | 5s, 10s, 20s, max 60s |
| Regra LIVE completa | SOFIA §2.5 | **ALTO** | Tooltip/metadata com source/occurred_at/received_at |
| STALE/UNKNOWN quando sem `source_event_id` válido | SOFIA §2.5 | **ALTO** | Honestidade, nenhum LIVE fabricado |

### 6.3 Controles de Portabilidade (CONTROLE E4)

| Controle | Artefato | Prioridade | Implementação |
|----------|----------|------------|---------------|
| Migrations SQL versionadas | SOFIA §2.4 | **MÉDIO** | `supabase/migrations/` |
| Nenhuma função proprietária Vercel em lógica de domínio | SOFIA §2.4 | **MÉDIO** | Zero Vercel-specific features |
| URLs e secrets em `.env` | SOFIA §2.4 | **MÉDIO** | `.env.example` documentado |
| Adaptador de Realtime isolado | SOFIA §2.4 | **MÉDIO** | `lib/realtime-adapter.ts` |
| README com deploy alternativo VPS | SOFIA §2.4 | **MÉDIO** | Instruções para VPS + PostgreSQL |

---

## 7. SECURITY ACCEPTANCE GATE PARA ENTRAR EM E4

### 7.1 Condições Obrigatórias (BLOCKER-1/2)

**Bloqueio:** **NÃO** pode iniciar trilha MCF (`/api/ingest/mcf` e projeções MCF) até estas condições serem atendidas:

- [ ] **BLOCKER-1 especificado no contrato:** Seção "Autenticação e Assinatura" em `MCF-CONTROL-EVENT-v1.md` definindo:
  - HMAC-SHA256 sobre corpo bruto + timestamp de transporte
  - Janela de replay baseada em `t` (timestamp de transporte)
  - Assinatura para TODOS os eventTypes
  - Rotação de segredo com sobreposição (current + previous)
  - Sem caminho "assinatura opcional"

- [ ] **BLOCKER-2 especificado no contrato:** Seção "Schema detalhado do Ledger" em `E3-CONTROL-CENTER-ARCHITECTURE.md` definindo:
  - `source_events` com `raw_body`, `signature_status`, `ingest_receipts`
  - Append-only enforcement (trigger)
  - Regra anti-drift (colunas derivadas do `body`)
  - Índices otimizados
  - `created_at` como chave candidata para particionamento

### 7.2 Condições Obrigatórias (CONTROLE E4)

**Bloqueio:** **NÃO** pode habilitar comandos ou expor dados operacionais do MCF até estas condições serem atendidas:

- [ ] **Nenhum secret no bundle cliente:** Build-time check garante que `.env` não é exposto no frontend.

- [ ] **RLS configurado em todas as tabelas sensíveis:** missions, gates, handoffs, evidence_receipts têm RLS policies.

- [ ] **service_role SOLO para backend:** service_role não exposto no cliente.

- [ ] **Rate limiting implementado:** `/api/ingest/mcf` e `/api/webhooks/github` têm rate limiting.

- [ ] **Validação de schema:** Eventos com campos inválidos são rejeitados.

- [ ] **Limites de tamanho de payload/webhook:** 1MB/10MB máximos.

- [ ] **Fallback de polling implementado:** Realtime falha → polling ativo.

- [ ] **Rota LIVE completa:** Todo campo marcado LIVE tem tooltip/metadata com source/occurred_at/received_at.

- [ ] **Banner "Modo Degradado":** Exibido quando em fallback de polling.

- [ ] **README com `.env.example`:** Documentação completa de secrets e deploy alternativo.

### 7.3 Condições Opcionais (Monitoramento Futuro)

**Não bloqueantes, mas recomendadas:**

- [ ] **Particionamento de `source_events`:** Decidir após 3 meses de monitoramento (HIP de RAFAEL).
- [ ] **TTL de `source_events`:** Decidir após 3 meses de monitoramento (HIP de RAFAEL).
- [ ] **Fila durável entre webhook e ingest:** Escalabilidade futura, não E4.

### 7.4 Condição de Aceite Final

**Gate de Segurança para E4:**

> **APROVADO** se e somente se:
>
> 1. BLOCKER-1 e BLOCKER-2 estão especificados no contrato (correções de RAFAEL aplicadas).
> 2. Nenhum secret no bundle cliente (build-time check).
> 3. RLS configurado em todas as tabelas sensíveis.
> 4. service_role SOLO para backend.
> 5. Rate limiting implementado.
> 6. Validação de schema e limites de tamanho implementados.
> 7. Fallback de polling implementado.
> 8. Rota LIVE completa implementada.
> 9. README com `.env.example` e deploy alternativo documentado.
>
> **REJEITADO** se:
>
> 1. BLOCKER-1 ou BLOCKER-2 não especificados no contrato.
> 2. Qualquer secret exposto no bundle cliente.
> 3. RLS não configurado em tabelas sensíveis.
> 4. service_role exposto no cliente.
> 5. Rate limiting não implementado.
> 6. Validação de schema não implementada.
> 7. Fallback de polling não implementado.
> 8. Rota LIVE não completa.
> 9. README não documentado.

---

## 8. HANDOFF PARA EMILY

### 8.1 Próximo Passo

**Destinatário:** EMILY (Auditoria de Segurança)

**Estado atual da missão:**
- Arquitetura estruturalmente aprovada por SOFIA.
- BLOCKER-1/2 identificados e especificados (correções de RAFAEL).
- Controles de segurança críticos definidos.
- Condições de aceite para E4 estabelecidas.

### 8.2 Entrega para Emily

**Artefatos de Referência:**

1. **Contrato Normativo:** `agents/RICARDO.md` — método mínimo, evidência mínima, transferência.
2. **Arquitetura:** `source/E3-CONTROL-CENTER-ARCHITECTURE.md` — componentes, schema, portabilidade.
3. **Contrato de Evento:** `source/MCF-CONTROL-EVENT-v1.md` — envelope, tipos, regras.
4. **Revisão SOFIA:** `handoff/SOFIA-E3-ARCHITECTURE-REVIEW.md` — decisão de arquitetura, blockers, não-blockers.
5. **Revisão RAFAEL:** `handoff/RAFAEL-E3-ENGINEERING-REVIEW.md` — especificação técnica de BLOCKER-1/2, schema detalhado, ordem de implementação.
6. **Revisão RICARDO:** Este documento — análise de segurança, threat model, controles obrigatórios, acceptance gate.

**Evidências de Segurança:**

1. **BLOCKER-1 (Assinatura/Replay):**
   - Especificação corrigida em `MCF-CONTROL-EVENT-v1.md` (RAFAEL §4).
   - HMAC-SHA256 sobre corpo bruto + timestamp de transporte.
   - Janela de replay baseada em `t`.
   - Assinatura para TODOS os eventTypes.
   - Rotação de segredo com sobreposição.
   - Idempotência por `event_id`.

2. **BLOCKER-2 (Ledger/Schema):**
   - Especificação corrigida em `E3-CONTROL-CENTER-ARCHITECTURE.md` (RAFAEL §5).
   - `raw_body`, `signature_status`, `ingest_receipts`.
   - Append-only enforcement.
   - Regra anti-drift.
   - Índices otimizados.
   - `created_at` como chave candidata.

3. **Controles Obrigatórios E4:**
   - Nenhum secret no bundle cliente.
   - RLS configurado.
   - service_role SOLO para backend.
   - Rate limiting.
   - Validação de schema.
   - Fallback de polling.
   - Rota LIVE completa.

4. **Threat Model:**
   - Fronteiras de confiança mapeadas.
   - Ameaças identificadas com probabilidade e impacto.
   - Controles atuais vs. obrigatórios.
   - Risco residual estimado (MODERADO).

### 8.3 Tarefas de Emily

**Auditáveis:**

1. **Validação de BLOCKER-1/2:**
   - Verificar se especificações estão corretas e completas.
   - Verificar se implementação será possível.
   - Verificar se controles são adequados ao risco.

2. **Validação de Controles Obrigatórios E4:**
   - Verificar se controles são implementáveis.
   - Verificar se há gaps ou duplicações.
   - Verificar se controles são proporcionais ao risco.

3. **Validação de Threat Model:**
   - Verificar se todas as ameaças foram identificadas.
   - Verificar se controles são adequados a cada ameaça.
   - Verificar se probabilidade/impacto são corretos.

4. **Validação de Acceptance Gate:**
   - Verificar se condições de aceite são claras e verificáveis.
   - Verificar se gate é estrito o suficiente.
   - Verificar se gate é flexível o suficiente para evolução.

5. **Validação de Risco Residual:**
   - Verificar se risco residual é aceitável para fase inicial.
   - Verificar se monitoramento contínuo é adequado.
   - Verificar se planejamento futuro é adequado.

### 8.4 Condição de Aceite para Emily

**Gate de Aceite:**

> **APROVADO** se e somente se:
>
> 1. BLOCKER-1 e BLOCKER-2 especificações são corretas e completas.
> 2. Controles obrigatórios E4 são implementáveis e adequados.
> 3. Threat model é completo e controles são proporcionais.
> 4. Acceptance gate é claro e verificável.
> 5. Risco residual é aceitável para fase inicial.
>
> **REJEITADO** se:
>
> 1. BLOCKER-1 ou BLOCKER-2 especificações são incompletas ou incorretas.
> 2. Controles obrigatórios E4 têm gaps ou são inadequados.
> 3. Threat model é incompleto ou controles são inadequados.
> 4. Acceptance gate é ambíguo ou não verificável.
> 5. Risco residual é inaceitável para fase inicial.

### 8.5 Transferência de Estado

**Estado atual:**
- Arquitetura estruturalmente aprovada.
- BLOCKER-1/2 especificados.
- Controles de segurança definidos.
- Acceptance gate estabelecido.
- Pronto para handoff a Emily.

**Próxima ação:**
- Entregar para EMILY para auditoria final de segurança.
- Aguardar aprovação de Emily antes de iniciar E4.
- Se aprovado, handoff para LÉO para aprovação final.

---

**Status final:** Revisão de segurança completa. Aprovação condicional para E4 com correções obrigatórias de BLOCKER-1/2 aplicadas.

**Evidência mínima (cf. contrato `agents/RICARDO.md`):**
- Artefatos analisados: `agents/RICARDO.md`, `source/E3-CONTROL-CENTER-ARCHITECTURE.md`, `source/MCF-CONTROL-EVENT-v1.md`, `handoff/SOFIA-E3-ARCHITECTURE-REVIEW.md`, `handoff/RAFAEL-E3-ENGINEERING-REVIEW.md`.
- Critérios aplicados: método mínimo do contrato; separação entre [ARQ]/[ENG]/[HIP]; regra "não aceitar automaticamente parecer de SOFIA".
- Resultado: verdicto §1, blockers §3, correções §4/5, controles obrigatórios §6, acceptance gate §7, handoff §8.
- Limitações: não implementei código nem validei em runtime local (missão proíbe alteração de arquivos e ação externa); oracle/valores de scaling ([HIP]) não verificados.
- Condição de aceite: resolver BLOCKER-1 (com HMAC sobre corpo bruto + janela de transporte, sem assinatura opcional) e BLOCKER-2 (schema com `raw_body`, `signature_status`, `ingest_receipts`, append-only enforcement) formalizados no contrato antes do início da trilha B de E4.
