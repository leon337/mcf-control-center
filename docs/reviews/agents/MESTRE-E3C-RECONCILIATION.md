# MESTRE — Reconciliação E3C Pattern B

Mission: `MCF-CONTROL-CENTER-001`
Stage: `E3C — fechamento arquitetural / Pattern B`
Status: `PENDING_EMILY_FINAL_AUDIT`
Authority: MESTRE reconcilia tecnicamente; LEANDRO permanece autoridade humana/HUMAN_GATE.

## Cadeia considerada

- LÉO: `LEO-E3-PROJECTION-SEMANTICS.md` — parecer operacional pré-Pattern-B, preservado como artefato canônico de opinião.
- SOFIA Pattern B: `SOFIA-E3-PROJECTION-WORKSHOP-REVIEW.md`, SHA `dc0d56e70c2bba5620ecfe3f16cd9dadb6f9a0000e0244825380f86f28945253`.
- RAFAEL Pattern B: `RAFAEL-E3-PATTERN-B-ENGINEERING-REVIEW.md`, SHA `b83f592c6898be312a4c4f2fe536b7c9b8082916d3050759776f72f3214e76c2`.
- RICARDO: `RICARDO-E3-SECURITY-REVIEW.md` — parecer de segurança oficial anterior, ainda aplicável às fronteiras de assinatura/ledger.
- Evidência live do enum MCF: `docs/evidence/mcf/MCF-EVENT-TYPES-main-0825bbc.md`.

Sessões inválidas, legacy ou alternate permanecem fora da cadeia de decisão. Pattern B impede herança implícita de contexto entre agentes.

## Decisão 1 — identidade e ordering

**RATIFICADA COM CORREÇÃO:**

- `eventId = mcf_events.id` e é a identidade/idempotência exposta.
- `sourceSequence = mcf_events.sequence` e é ordering, não PK nem idempotency key.
- `idempotency_key` fica interna ao Runtime.
- `sourceSequence` é global da tabela; gaps numéricos por missão são naturais quando missões intercalam eventos.
- É proibido inferir perda por `sequence[n] - sequence[n-1] > 1` dentro de uma missão.

## Decisão 2 — duplicate, conflict e late event

**RECONCILIADA:**

- mesmo `eventId` + mesmo raw-body hash = retry idempotente/`duplicate`; não reinsere nem reaplica projeção;
- mesmo `eventId` + body diferente = `conflict`, rejeitado e auditado;
- evento válido que chega com `sourceSequence` abaixo do watermark não é descartado: entra no ledger, marca projeção `DEGRADED` e exige reconcile/rebuild;
- perda real só é afirmada após reconciliação contra o Runtime autoritativo.

Isso substitui formulações anteriores de `REJECT` genérico para qualquer duplicate/out-of-order.

## Decisão 3 — LIVE / STALE / DEGRADED / UNKNOWN

**RATIFICADA:**

- `LIVE`: evidência verificável + projeção reconciliada + atualidade/heartbeat válidos;
- `STALE`: último estado verificável, mas fora da janela de atualidade;
- `DEGRADED`: parcial, late event, reconciliação pendente ou fonte parcialmente disponível;
- `UNKNOWN`: evidência insuficiente para afirmar o valor.

`occurredAt` não ordena eventos. Clock skew além da tolerância gera warning e impede `LIVE` até reconciliação.

## Decisão 4 — retenção e particionamento

**RATIFICADA COM POSTURA CONSERVADORA:**

- `source_events`: append-only, sem TTL automático no MVP;
- `ingest_receipts`: também sem deleção automática no MVP; retenção/arquivamento só após evidência real de volume;
- projeções: reconstruíveis, sem TTL destrutivo;
- MVP sem particionamento; índices suficientes;
- particionamento futuro, se necessário, por tempo/data; nunca um particionamento por missão que gere explosão de partições.

## Decisão 5 — event types e campos derivados

**BLOCKER DO ENUM RESOLVIDO PELO MESTRE.**

O GitHub canônico foi verificado em `main@0825bbcfa1c9e8a07c08d9ff7d9ecbcc51186b22`. O enum completo `McfEventType` foi congelado como evidência. O contrato v1 agora exige nomes Runtime-native reais para envelopes que representam `mcf_events`.

Nomes sintéticos antigos do draft não podem fingir ser eventos nativos. Saúde do Control Center usa namespace separado.

`skillId`, `repository`, `commitSha`, `missionVersion` e `evidenceRef` permanecem opcionais e só podem ser preenchidos com proveniência determinística; ausência de fonte = `null`, nunca inferência fabricada.

## Decisão 6 — BLOCKER-1 assinatura / replay

**RESOLVIDO NO NÍVEL DE ESPECIFICAÇÃO E3; IMPLEMENTAÇÃO CONTINUA GATED PARA E6.**

O contrato agora define:

- assinatura HMAC-SHA256 obrigatória para todo evento MCF;
- material assinado = timestamp de transporte + raw body completo;
- replay window de 5 minutos verificada pelo relógio do receptor;
- `occurredAt` excluído da lógica de replay;
- rotação current + previous secret;
- secrets exclusivamente server-side;
- falha fechada antes de qualquer projeção.

A especificação original de HMAC sobre subconjunto permanece rejeitada conforme RICARDO.

## Decisão 7 — BLOCKER-2 ledger / schema

**RESOLVIDO NO NÍVEL DE ESPECIFICAÇÃO E3; IMPLEMENTAÇÃO CONTINUA GATED PARA E4/E6.**

A arquitetura agora define `source_events`, `ingest_receipts`, raw body/hash, `signature_status`, append-only, anti-drift, índices, `source_sequence`, receipts de accepted/duplicate/rejected/conflict e ausência de TTL destrutivo no MVP.

## Decisão 8 — outbound é capacidade futura

**RATIFICADA:** o Runtime auditado não possui sender outbound nas fontes consideradas. O contrato define capacidade nova. A implementação fica em E6; nenhuma documentação pode afirmar que o Runtime já envia esses envelopes hoje.

## Fronteira E3 versus E4–E6

Para evitar um gate circular:

- E3 fecha quando a especificação crítica estiver reconciliada e EMILY não encontrar blocker documental/material aberto.
- E4 implementa fundação Vercel/Supabase, migrations, server-only secrets, Auth/RLS e controles de deploy.
- E5 pode integrar GitHub público/verificado de forma independente.
- E6 só ativa MCF ingest/outbound após testes de HMAC/replay/append-only/receipts.
- comandos continuam fora do MVP observer e HUMAN_GATE permanece exclusivo de LEANDRO.

## Disposição dos blockers

1. Enum `McfEventType`: **RESOLVIDO** por evidência live do GitHub canônico.
2. `source_sequence` + ordering/dedupe: **RESOLVIDO NA ESPECIFICAÇÃO**.
3. Correções PK/STALE/particionamento: **RESOLVIDAS NA ESPECIFICAÇÃO**.
4. Proveniência de campos derivados: **RESOLVIDA** por nullable + origem determinística obrigatória.
5. Gap reconciliation / clock skew: **RESOLVIDOS NA ESPECIFICAÇÃO**.
6. BLOCKER-1 security: **RESOLVIDO NA ESPECIFICAÇÃO**, implementação testada será gate de E6.
7. BLOCKER-2 ledger: **RESOLVIDO NA ESPECIFICAÇÃO**, migration/enforcement será gate de E4/E6.

## Veredito do MESTRE

**E3C PRONTA PARA AUDITORIA FINAL DA EMILY.**

E3 ainda **não está encerrada**. E4 permanece `NOT_STARTED` até EMILY auditar os documentos reconciliados e devolver veredito sem blocker aberto, ou até o MESTRE tratar qualquer novo blocker encontrado.
