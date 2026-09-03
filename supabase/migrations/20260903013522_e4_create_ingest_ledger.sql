create table public.source_events (
  event_id text primary key,
  source_sequence bigint not null,
  source text not null,
  event_type text not null,
  mission_id text,
  phase_id text,
  agent_id text,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  body jsonb not null,
  raw_body bytea not null,
  raw_body_sha256 text not null,
  signature_status text not null check (signature_status in ('verified','failed','not_required')),
  transport_timestamp_ms bigint,
  created_at timestamptz not null default now(),
  constraint source_events_mcf_signature_verified
    check (source <> 'mcf-runtime' or signature_status = 'verified')
);

create index source_events_mission_sequence_idx on public.source_events (mission_id, source_sequence);
create index source_events_source_received_idx on public.source_events (source, received_at desc);
create index source_events_type_received_idx on public.source_events (event_type, received_at desc);
create index source_events_occurred_idx on public.source_events (occurred_at desc);

create table public.ingest_receipts (
  receipt_id text primary key,
  source text not null,
  event_id text,
  raw_body_sha256 text not null,
  outcome text not null check (outcome in ('accepted','duplicate','rejected','conflict')),
  reason_code text,
  signature_status text not null check (signature_status in ('verified','failed','not_required')),
  transport_timestamp_ms bigint,
  received_at timestamptz not null default now(),
  prior_receipt_id text references public.ingest_receipts(receipt_id)
);

create index ingest_receipts_event_idx on public.ingest_receipts (event_id, received_at desc);
create index ingest_receipts_source_received_idx on public.ingest_receipts (source, received_at desc);

create or replace function public.reject_append_only_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'append-only table: % is not permitted on %', tg_op, tg_table_name;
end;
$$;

create trigger source_events_reject_update_delete
before update or delete on public.source_events
for each row execute function public.reject_append_only_mutation();

create trigger ingest_receipts_reject_update_delete
before update or delete on public.ingest_receipts
for each row execute function public.reject_append_only_mutation();

alter table public.source_events enable row level security;
alter table public.ingest_receipts enable row level security;

revoke all on table public.source_events from anon, authenticated;
revoke all on table public.ingest_receipts from anon, authenticated;
