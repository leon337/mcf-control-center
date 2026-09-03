# MCF Control Event Envelope v1

Mission: `MCF-CONTROL-CENTER-001`
Status: `E3_RECONCILED_PENDING_EMILY`

Contrato proposto para uma **nova capacidade outbound** do MCF Runtime para o Control Center. O Runtime atual não possui transporte outbound implementado nas fontes auditadas; a emissão será implementada na etapa E6.

## Envelope

```json
{
  "schema": "mcf_control_event/v1",
  "eventId": "stable-mcf-event-id",
  "sourceSequence": 12345,
  "eventType": "MISSION_STATE_CHANGED",
  "source": "mcf-runtime",
  "occurredAt": "2026-09-02T18:00:00.000Z",
  "missionId": "uuid",
  "phaseId": null,
  "agentId": null,
  "skillId": null,
  "repository": "leon337/multiagent-collaboration-framework",
  "commitSha": null,
  "missionVersion": null,
  "evidenceRef": null,
  "payload": {}
}
```

## Mapping obrigatório

- `eventId` → `mcf_events.id`; é a chave de identidade/idempotência exposta ao Control Center.
- `sourceSequence` → `mcf_events.sequence`; é a ordem canônica de persistência, não uma chave de dedupe.
- `eventType` → valor real de `McfEventType` quando o envelope representa uma linha de `mcf_events`.
- `occurredAt` → `mcf_events.occurred_at`.
- `missionId`, `phaseId`, `agentId`, `payload` → campos correspondentes do evento persistido.
- `idempotency_key` permanece interna ao Runtime e não é serializada no envelope.

## Campos derivados opcionais

`skillId`, `repository`, `commitSha`, `missionVersion` e `evidenceRef` só podem ser preenchidos quando houver origem determinística e auditável no momento da emissão. Não devem ser inventados para satisfazer o schema.

- `missionVersion`: versão da missão capturada da fonte autoritativa quando semanticamente aplicável.
- `skillId`: contexto de fase/skill quando resolvível de forma determinística.
- `commitSha`: somente receipt/evidência que contenha explicitamente o SHA.
- `repository`: configuração de origem do Runtime/projeto, não inferência do browser.
- `evidenceRef`: referência real a receipt/evidência existente.

Campos sem origem comprovável devem ser `null`. Novos identificadores de handoff/snapshot exigem evolução explícita do contrato.

## Tipos Runtime-native canônicos

Quando o envelope representa uma linha de `mcf_events`, `eventType` deve pertencer ao `McfEventType` canônico do Runtime. A enumeração completa verificada está congelada em `docs/evidence/mcf/MCF-EVENT-TYPES-main-0825bbc.md` e vinculada ao commit MCF `0825bbcfa1c9e8a07c08d9ff7d9ecbcc51186b22`.

Nomes antigos do draft que não pertencem ao enum canônico não podem ser apresentados como eventos nativos do Runtime. Eventos sintéticos do Control Center devem usar namespace separado.

## Autenticação, assinatura e replay

Todo evento MCF server-to-server é assinado; não existe caminho MCF "sem assinatura".

Headers de transporte:

- `X-MCF-Timestamp`: epoch em milissegundos gerado pelo emissor no envio.
- `X-MCF-Signature`: `v1=<hex-hmac-sha256>`.

Material assinado:

```text
t=<X-MCF-Timestamp>\n<raw HTTP body bytes>
```

O receptor deve:

1. capturar o raw body antes do parse JSON;
2. validar `|now - timestamp| <= 5 minutos`;
3. validar HMAC-SHA256 em comparação constant-time usando o secret atual e, durante rotação, o secret anterior;
4. somente depois parsear e validar schema/versão;
5. registrar o resultado da verificação no receipt.

`occurredAt` é timestamp de negócio e não participa da janela de replay. Secrets são server-side e nunca entram no browser, payload ou logs.

## Idempotência, duplicata e conflito

`eventId` é a identidade do evento no Control Center.

- Primeiro recebimento válido de `eventId` → inserir em `source_events`, gerar receipt `accepted` e aplicar/reconciliar projeções.
- Mesmo `eventId` + mesmo hash do raw body → não inserir nem reaplicar; gerar/retornar receipt `duplicate` referenciando a aceitação original.
- Mesmo `eventId` + conteúdo diferente → rejeitar como `event_id_conflict`; nunca sobrescrever o ledger.

Essa distinção preserva idempotência sem confundir retry legítimo com colisão/adulteração.

## Ordering e reconciliação

`sourceSequence` é `mcf_events.sequence`, uma identity **global da tabela**. Portanto eventos de outras missões criam gaps numéricos naturais dentro de uma missão.

Regras:

1. Persistir eventos válidos sem exigir `sourceSequence = previous + 1` por missão.
2. Projeções de uma missão são avaliadas em `sourceSequence ASC`.
3. Evento novo com sequence menor que o watermark já aplicado é late/out-of-order: armazenar, marcar a projeção `DEGRADED` e reconciliar/reconstruir antes de voltar a `LIVE`.
4. Perda de eventos só pode ser afirmada por reconciliação com a fonte autoritativa do Runtime; diferença aritmética de sequence não prova gap.
5. `occurredAt` não determina ordering.

## Endpoint alvo

`POST /api/ingest/mcf`

A implementação é E6. Deve falhar fechada para assinatura, timestamp, schema e versão inválidos, preservando receipt auditável para tentativas processadas pelo servidor.

## Persistência esperada

Para cada tentativa de ingest processada:

- `ingest_receipts` registra aceitação, duplicata, rejeição ou conflito;
- somente eventos aceitos entram em `source_events`;
- `source_events` é append-only e não possui TTL automático no MVP;
- projeções são derivadas/reconstruíveis e nunca substituem o ledger;
- raw body/hash e status de assinatura permitem auditoria posterior.

O schema detalhado do ledger está em `docs/architecture/E3-CONTROL-CENTER-ARCHITECTURE.md`.

## Autoridade e UI

- `LEANDRO` não é serializado como agente técnico.
- HUMAN_GATE mantém proveniência de autoridade e nunca transporta credenciais no evento.
- O browser não valida assinatura nem possui secrets.
- A UI só apresenta `LIVE` quando a projeção tem evidência verificável e saúde/reconciliação válidas; caso contrário usa `STALE`, `DEGRADED` ou `UNKNOWN`.

## Evolução

Mudança incompatível cria `mcf_control_event/v2`. Consumidores não inferem campos ausentes nem tratam campos opcionais `null` como evidência existente.
