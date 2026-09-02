# E2 — Auditoria técnica dos artefatos originais

Mission: `MCF-CONTROL-CENTER-001`
Date: `2026-09-02`
Scope: somente leitura dos HTMLs preservados em `artifacts/originals/workbuddy/`.

## Resumo executivo

- `github-monitor.html` (GitPulse): **LIVE PARCIAL CONFIRMADO**. Consulta a API pública do GitHub e mantém polling de eventos a cada 30 segundos.
- `agent-apps-scene.html` (Mission Control): **SNAPSHOT/DEMO ESTÁTICO**. Não possui chamada externa, WebSocket, EventSource, storage ou polling de runtime.
- Ambos são HTMLs autossuficientes: sem script, stylesheet ou imagem externa declarada.
- Nenhum dos originais foi modificado nesta auditoria.

## 1. Agent Apps Scene / Mission Control

### Estrutura
- 1 HTML único, 1493 linhas.
- 1 script inline.
- 0 `fetch()`.
- 0 `setInterval`.
- 0 WebSocket / EventSource.
- 0 localStorage / sessionStorage / IndexedDB.
- 1 `setTimeout`, usado apenas para efeito visual ao clicar em fase pendente/queued.
- Lista de agentes e skills é construída a partir de arrays JavaScript embutidos no próprio arquivo.

### Classificação de dados
**SNAPSHOT/DEMO**: missão, SHA, fases, handoffs, receipts, gates, activity feed, agent status e mission health são valores embutidos.

A etiqueta visual `RUNTIME LIVE` não possui mecanismo de I/O que a sustente no arquivo preservado.

### Drift verificado contra o MCF atual
- UI preservada mostra runtime `v1.1.0`; release estável GitHub atual verificada: `v1.3.0`.
- UI mostra SHA `7f741e1…`; `main` atual verificado: `0825bbcfa1c9e8a07c08d9ff7d9ecbcc51186b22`.
- UI mostra `16/16` skills; registry atual contém 17 skill IDs, incluindo `MCF-AUDIT-VISUAL-DESKTOP`.
- UI mostra `29 active`; o repositório atual mantém 29 contratos de agentes nomeados. O número coincide, mas continua estático no HTML e não prova atividade runtime.
- Eventos, receipts e métricas como `148`, `943 tests` e status de gate são estáticos.

## 2. GitHub Monitor / GitPulse

### Estrutura
- 1 HTML único, 1404 linhas.
- 1 script inline.
- 1 função de rede central `fetchJSON` usando `fetch()`.
- API base: `https://api.github.com/repos/leon337/multiagent-collaboration-framework`.
- Polling: `setInterval(pollEvents, 30000)`.
- Sem banco, storage local, WebSocket ou persistência.

### Carga inicial e refresh manual
`loadAllData()` consulta em paralelo:
1. metadata do repositório;
2. `/events?per_page=20`;
3. `/pulls?per_page=20`;
4. `/contributors?per_page=10`;
5. `/releases?per_page=10`.

### Polling contínuo
A cada 30 segundos, `pollEvents()` consulta **somente** `/events?per_page=20`.

Portanto, `POLLING ATIVO · 30s` é verdadeiro para o feed de eventos, não para todos os cards do dashboard. PRs, metadata, contributors e releases só são atualizados por `loadAllData()` (carga inicial ou botão de refresh).

### Evidência LIVE observada
- valores renderizados coincidiram com o GitHub real;
- header `X-RateLimit-Remaining` foi lido pela aplicação;
- durante observação, rate-limit caiu entre ciclos de polling;
- cópia preservada, servida fora do WorkBuddy, voltou a consultar o GitHub real.

## 3. Achados funcionais do GitPulse

### GITPULSE-01 — card Issues superconta PRs
`repo.open_issues_count` é exibido como `ISSUES ABERTAS`. Esse campo do GitHub inclui issues e pull requests.

Estado verificado no momento da auditoria:
- `open_issues_count`: 17;
- PRs abertos: 12;
- issues abertas reais (`is:issue is:open`): 5.

Correção futura: consultar issues separadamente ou calcular por endpoint/search apropriado.

### GITPULSE-02 — card Commits mostra watchers
O card rotulado `COMMITS (30D)` recebe `repo.watchers_count` e o subtítulo `watchers`.

Correção futura: ou renomear o card para Watchers, ou implementar contagem real de commits em 30 dias.

### GITPULSE-03 — polling parcial
O polling de 30s atualiza somente eventos. Um PR pode mudar sem todos os cards acompanharem imediatamente.

Correção futura: preferir eventos/webhooks persistidos e refresh seletivo por domínio.

### GITPULSE-04 — limite da API pública
A implementação usa API pública sem autenticação. Isso evita secret no frontend, mas herda limite baixo por IP e não é adequada como backend definitivo do cockpit.

## 4. Consequência arquitetural

Os dois artefatos devem ser preservados como baseline visual/funcional, mas com destinos diferentes:

- GitPulse: reaproveitar UI e semântica de feed; mover integração GitHub para camada de servidor/webhook + persistência.
- Mission Control: reaproveitar UI e navegação; substituir todos os snapshots por contratos reais do MCF Runtime/ledger.

## 5. Veredito E2

`E2_ARTIFACT_AUDIT = PASS`

Próxima etapa: **E3 — arquitetura do MCF Control Center**, definindo Vercel + Supabase, schema, eventos GitHub e contrato MCF Runtime → Control Center.
