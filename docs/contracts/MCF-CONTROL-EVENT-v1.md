# MCF Control Event Envelope v1

Status: `DRAFT_FOR_SPECIALIST_REVIEW`

Contrato proposto para eventos outbound do MCF Runtime para o Control Center.

## Envelope

```json
{
  "schema": "mcf_control_event/v1",
  "eventId": "uuid-or-stable-id",
  "eventType": "MISSION_STARTED",
  "source": "mcf-runtime",
  "occurredAt": "2026-09-02T18:00:00.000Z",
  "missionId": "uuid",
  "phaseId": "uuid-or-null",
  "agentId": "Mestre-or-null",
  "skillId": "MCF-START-MISSION-or-null",
  "repository": "leon337/multiagent-collaboration-framework",
  "commitSha": "40-char-sha-or-null",
  "missionVersion": 3,
  "evidenceRef": "receipt-id-or-null",
  "payload": {}
}
```

## Tipos iniciais

- `MISSION_CREATED`
- `MISSION_STATE_CHANGED`
- `PHASE_STARTED`
- `PHASE_COMPLETED`
- `AGENT_ASSIGNED`
- `HANDOFF_CREATED`
- `GATE_OPENED`
- `GATE_RESOLVED`
- `EVIDENCE_ACCEPTED`
- `EVIDENCE_REJECTED`
- `MISSION_COMPLETED`
- `RUNTIME_HEALTH_CHANGED`

## Regras

1. `eventId` deve ser idempotente.
2. `occurredAt` vem da origem; `receivedAt` é acrescentado pelo Control Center.
3. O Control Center não altera eventos recebidos; cria projeções derivadas.
4. Eventos sensíveis precisam de autenticação/assinatura no transporte.
5. `LEANDRO` não é serializado como agente técnico.
6. HUMAN_GATE deve manter proveniência de autoridade, sem expor dados de autenticação.
7. O UI só mostra `LIVE` quando a projeção aponta para evento/receipt verificável.

## Endpoint alvo

`POST /api/ingest/mcf`

Primeira implementação deve aceitar somente server-to-server e falhar fechada para schema, assinatura, replay ou versão inválida.

## Persistência

Cada evento gera:
- uma linha imutável em `source_events`;
- um `ingest_receipt` de aceitação/rejeição;
- atualização transacional das projeções correspondentes quando aceito.

## Evolução

Mudança incompatível cria `mcf_control_event/v2`; consumidores não devem inferir campos ausentes.
