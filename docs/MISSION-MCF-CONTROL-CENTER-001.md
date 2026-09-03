# MCF-CONTROL-CENTER-001

## Missão

Transformar os artefatos vivos do WorkBuddy em um cockpit operacional real do MCF, sob controle do repositório `leon337/mcf-control-center`, hospedado inicialmente em Vercel + Supabase e preparado para migração futura à infraestrutura própria.

## Autoridade e coordenação

- Autoridade humana final: **LEANDRO**
- HUMAN_GATE: **LEANDRO**
- Autoridade operacional: **LÉO**
- Coordenador: **MESTRE**
- Estratégia: equipe especializada convocada progressivamente por etapa; participação decorativa é proibida.

## Fontes de verdade

1. `leon337/mcf-control-center` — produto/cockpit.
2. `leon337/multiagent-collaboration-framework` — contratos, runtime, skills, gates e governança do MCF.
3. WorkBuddy artifacts — fonte dos dois artefatos originais a preservar antes de qualquer refatoração.
4. GitHub/Vercel/Supabase — estado verificável das integrações e ambientes.

## Invariantes

- Não reconstruir os artefatos antes de preservar os originais.
- `LIVE` só pode significar dado proveniente de fonte real e identificável.
- Nenhum segredo deve ser commitado no repositório público.
- Primeiro observabilidade read-only; depois persistência; por último ações operacionais.
- Deploy público e ações sensíveis permanecem sujeitos aos gates aplicáveis.
- Vercel + Supabase são fundação transitória; a arquitetura deve permanecer migrável.

## Equipe convocada

- **MESTRE** — coordenação e reconciliação.
- **Miriam** — recuperação de contexto e proveniência dos artefatos.
- **Leonardo / Carlos** — produto, requisitos e critérios de aceite.
- **Evelyn / Laura / Isabela / Marina** — preservação da experiência visual e fluxos.
- **Sofia / Rafael** — arquitetura e contratos de integração.
- **Rafael / Eduardo / Helena / Andre / Tiago / Daniela** — implementação conforme escopo aprovado.
- **Ricardo / Julia** — segurança, autenticação, secrets e HUMAN_GATE.
- **Renato** — testes e validação.
- **Gabriel / Bruno** — Git, CI, Vercel, deploy e rollback.
- **Augusto** — mission trace e observabilidade da execução.
- **LÉO** — avaliação operacional dos gates e continuidade.

## Etapas

### E0 — Fundação da missão
- registrar missão e fonte de verdade;
- criar branch de trabalho;
- criar checklist vivo;
- definir critérios e gates.

### E1 — Recuperar e preservar os artefatos
- extrair `agent-apps-scene.html`;
- extrair `github-monitor.html`;
- calcular hashes;
- armazenar cópias originais imutáveis no repositório;
- registrar proveniência WorkBuddy.

### E2 — Auditoria técnica dos artefatos
- mapear HTML/CSS/JS e dependências;
- identificar `fetch`, polling, timers e endpoints;
- separar dado real, snapshot e demonstração;
- documentar GitPulse live e Mission Control atual.

### E3 — Arquitetura do MCF Control Center
- definir frontend, API e event flow;
- definir Vercel + Supabase;
- definir modelo de dados e Realtime;
- definir GitHub webhooks;
- definir contrato MCF Runtime → Control Center;
- definir estratégia futura de migração para VPS.

### E4 — Fundação Vercel + Supabase
- criar projeto Vercel;
- criar projeto Supabase/Postgres;
- configurar variáveis sem expor secrets;
- estabelecer ambientes preview/staging;
- validar deploy mínimo e rollback.

### E5 — Integrar GitPulse
- preservar comportamento atual;
- substituir polling excessivo quando adequado por webhook/eventos;
- persistir eventos GitHub;
- validar atualização real no cockpit.

### E6 — Integrar Mission Control ao MCF real
- conectar versão/SHA atuais;
- conectar missões, fases e status;
- conectar agentes/skills;
- conectar handoffs e gates;
- conectar evidence receipts e runtime feed.

### E7 — Persistência e Realtime
- persistir mission state e event ledger;
- garantir reconexão sem perda de estado;
- atualizar cockpit em tempo real;
- registrar source + timestamp + evidence para dados LIVE.

### E8 — Segurança e governança
- autenticação do cockpit;
- autorização por função;
- proteção de secrets e webhooks;
- HUMAN_GATE de LEANDRO para operações sensíveis;
- trilha de auditoria.

### E9 — Validação ponta a ponta
- teste de mudança real no GitHub → cockpit;
- teste de evento real do MCF → cockpit;
- teste de persistência após reinício;
- teste mobile/desktop;
- teste de falha e rollback.

### E10 — Operação inicial
- publicar versão observadora;
- documentar operação e recovery;
- estabelecer baseline para futura camada de comando;
- preparar migração futura para infraestrutura própria.

## Estado atual

- Etapa concluída: **E3 — Arquitetura do MCF Control Center**.
- Status: **E3 FECHADA / E4 AINDA NÃO INICIADA**.
- Pattern B: workspaces isolados por agente + missão, com contexto explícito por handoff.
- Próximo marco: **E4 — Fundação Vercel + Supabase**, preservando HUMAN_GATE para autenticação, secrets, billing/contrato e publicação externa quando aplicável.
