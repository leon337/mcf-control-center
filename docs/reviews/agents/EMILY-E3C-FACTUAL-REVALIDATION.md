Agora vou compilar minha análise adversarial completa.

---

# EMILY — Parecer de Revalidação Adversarial E3C

**Mission:** `MCF-CONTROL-CENTER-001`  
**Auditora:** EMILY  
**Método:** Confrontação direta das fontes reconciliadas, modo adversarial, sem defender parecer anterior  
**Data:** 2026-09-03

---

## TABELA DE CONFRONTAÇÃO: Afirmação anterior → Fonte atual → Veredito

| # | Afirmação do parecer anterior | Fonte atual verificada | Correta/Incorreta |
|---|-------------------------------|------------------------|-------------------|
| 1 | `PHASE_STARTED`, `PHASE_COMPLETED`, `HANDOFF_CREATED` não existem no enum canônico | `MCF-EVENT-TYPES-main-0825bbc.md` linhas 18, 38, 32 | **INCORRETA** |
| 2 | Enum possui 28 valores | Contagem direta: 30 valores (linhas 12-41) | **INCORRETA** |
| 3 | `GATE_OPENED`, `GATE_RESOLVED`, `AGENT_ASSIGNED`, `EVIDENCE_ACCEPTED`, `RUNTIME_HEALTH_CHANGED` ainda são propostos como Runtime-native | Busca em E3-CONTROL-CENTER-ARCHITECTURE.md, MCF-CONTROL-EVENT-v1.md, MESTRE-E3C-RECONCILIATION.md: **0 ocorrências** | **INCORRETA** — Esses nomes só aparecem em documentos históricos (LEO-E3-PROJECTION-SEMANTICS.md, RAFAEL) anteriores à reconciliação |
| 4 | `skillId`, `repository`, `commitSha`, `missionVersion`, `evidenceRef` tratados como campos nativos obrigatórios de `mcf_events` | MCF-CONTROL-EVENT-v1.md linha 39-49: **"Campos derivados opcionais"** que só podem ser preenchidos com "origem determinística e auditável"; "Campos sem origem comprovável devem ser `null`" | **INCORRETA** — São explicitamente **derivados opcionais**, não nativos |
| 5 | `eventId` não é identidade/idempotência | MCF-CONTROL-EVENT-v1.md linha 32: "eventId → mcf_events.id; é a chave de identidade/idempotência exposta ao Control Center" | **INCORRETA** |
| 6 | `sourceSequence` não serve para ordering | MCF-CONTROL-EVENT-v1.md linha 33, E3-CONTROL-CENTER-ARCHITECTURE.md linha 241: "sourceSequence ordena"; eventos "avaliados em sourceSequence ASC" | **INCORRETA** |

---

## FINDINGS REMANESCENTES (por severidade)

### CRÍTICO
**NENHUM.**

### ALTO
**NENHUM.**

### MÉDIO
**NENHUM.**

### BAIXO
**NENHUM.**

---

## ANÁLISE DE CONFORMIDADE

### Critério 1: Enum McfEventType canônico
**STATUS:** ✅ **CONFORME**

- Enum verificado no commit `main@0825bbcfa1c9e8a07c08d9ff7d9ecbcc51186b22`
- 30 valores documentados em `MCF-EVENT-TYPES-main-0825bbc.md`
- `PHASE_STARTED`, `PHASE_COMPLETED`, `HANDOFF_CREATED` **existem** no enum canônico
- Contrato MCF-CONTROL-EVENT-v1.md linha 51-56 exige tipos Runtime-native reais
- Nomes de draft antigos (`GATE_OPENED`, `GATE_RESOLVED`, `AGENT_ASSIGNED`, `EVIDENCE_ACCEPTED`, `RUNTIME_HEALTH_CHANGED`) **foram removidos** dos documentos reconciliados

### Critério 2: Identidade e ordering
**STATUS:** ✅ **CONFORME**

- `eventId = mcf_events.id` — identidade/idempotência (contrato linha 32, arquitetura linha 238)
- `sourceSequence = mcf_events.sequence` — ordering global (contrato linha 33, 94-95, arquitetura linha 241-242)
- `idempotency_key` permanece interna (contrato linha 37, arquitetura linha 172)
- Gaps por missão são naturais e não indicam perda (arquitetura linha 243-244)

### Critério 3: Campos derivados opcionais
**STATUS:** ✅ **CONFORME**

- `skillId`, `repository`, `commitSha`, `missionVersion`, `evidenceRef` são **explicitamente campos derivados opcionais** (contrato linha 39-49)
- Só podem ser preenchidos com "origem determinística e auditável"
- "Campos sem origem comprovável devem ser `null`"
- Não são campos nativos de `mcf_events`

### Critério 4: Dedupe, conflict, late event
**STATUS:** ✅ **CONFORME**

- Mesmo `eventId` + mesmo hash = `duplicate` (contrato linha 87, arquitetura linha 239)
- Mesmo `eventId` + body diferente = `conflict` (contrato linha 88, arquitetura linha 240)
- Late event abaixo do watermark → persiste, marca `DEGRADED`, reconcilia (contrato linha 100-101, arquitetura linha 247-248)

### Critério 5: LIVE/STALE/DEGRADED/UNKNOWN
**STATUS:** ✅ **CONFORME**

- Semântica definida (arquitetura linhas 253-259)
- `occurredAt` não ordena (contrato linha 102, arquitetura linha 259)
- Clock skew gera warning, impede `LIVE` (arquitetura linha 259)

### Critério 6: BLOCKER-1 Assinatura/Replay
**STATUS:** ✅ **ESPECIFICADO**

- HMAC-SHA256 obrigatório (contrato linhas 59-81, arquitetura linha 265)
- Material assinado = timestamp de transporte + raw body completo (contrato linha 68-69)
- Replay window 5 minutos (contrato linha 75, arquitetura linha 267)
- Rotação current + previous (contrato linha 76, arquitetura linha 268)
- Falha fechada (contrato linha 78, arquitetura linha 270)
- **Implementação gated para E6** (MESTRE linha 72, arquitetura linha 282)

### Critério 7: BLOCKER-2 Ledger/Schema
**STATUS:** ✅ **ESPECIFICADO**

- `source_events` append-only definido (arquitetura linhas 177-218)
- `ingest_receipts` definido (arquitetura linhas 220-235)
- PK, índices, anti-drift, trigger, sem TTL MVP (arquitetura linhas 181-216)
- **Implementação gated para E4/E6** (MESTRE linha 87, arquitetura linha 282)

### Critério 8: Reconciliação canônica
**STATUS:** ✅ **CONFORME**

- MESTRE-E3C-RECONCILIATION.md reconcilia tecnicamente toda a cadeia Pattern B
- Documentos conflitantes históricos identificados e isolados
- Enum canônico congelado contra GitHub verificado
- Todos os 7 blockers anteriores dispostos (MESTRE linhas 106-115)

---

## LIMITAÇÕES DA AUDITORIA

1. **Independência executora:** Esta revalidação foi executada pela mesma EMILY que emitiu o parecer anterior incorreto. Uma auditoria verdadeiramente independente exigiria agente diferente ou validação humana direta.

2. **Verificação de implementação:** Esta auditoria avalia apenas **especificação e reconciliação documental**. A conformidade da implementação futura (E4-E6) exigirá auditoria de código, testes e receipts reais.

3. **Evidência GitHub:** A evidência do enum depende de snapshot em `MCF-EVENT-TYPES-main-0825bbc.md`. Não reconectei ao GitHub live nesta sessão; confiei na proveniência do documento reconciliado.

---

## CAUSA PROVÁVEL DO ERRO ANTERIOR

Meu parecer anterior continha **múltiplos erros factuais graves**:

1. **Não li o arquivo `MCF-EVENT-TYPES-main-0825bbc.md`** antes de afirmar que nomes do enum não existiam
2. **Tratei pareceres históricos** (LÉO/SOFIA/RAFAEL) como fonte superior aos documentos reconciliados
3. **Não executei grep** para confirmar se nomes de draft ainda existiam nos documentos finais
4. **Contei incorretamente** o número de valores do enum
5. **Confundi campos derivados opcionais do envelope** com campos nativos de `mcf_events`

A causa raiz foi **não verificar diretamente as fontes de verdade** antes de emitir blocker. Confiei em interpretação de pareceres intermediários em vez de ler os documentos reconciliados linha por linha.

---

## BLOCKERS REMANESCENTES

**NENHUM BLOCKER DOCUMENTAL ABERTO.**

Todos os requisitos de fechamento E3 estão cumpridos:

1. ✅ Parecer Pattern B de SOFIA e RAFAEL com proveniência fechada
2. ✅ Enum `McfEventType` real congelado contra GitHub canônico (30 valores)
3. ✅ BLOCKER-1 assinatura/replay especificado no contrato
4. ✅ BLOCKER-2 ledger/schema/append-only especificado na arquitetura
5. ✅ Ordering global/gaps/late events reconciliados
6. ✅ Reconciliação técnica completa pelo MESTRE

---

## VEREDITO FINAL

**`E3_PODE_FECHAR`**

A especificação arquitetural e contratual de E3 está reconciliada, completa e sem blocker documental aberto. 

A implementação de infraestrutura (E4), GitHub live (E5) e MCF ingest/outbound (E6) permanece corretamente gated conforme a fronteira definida em `E3-CONTROL-CENTER-ARCHITECTURE.md` linha 274-283 e `MESTRE-E3C-RECONCILIATION.md` linha 97-105.

---

**EMILY**  
Auditoria Independente MCF  
Workspace: `/var/tmp/mcf-control-center-001/emily`  
Sessão: Revalidação adversarial E3C