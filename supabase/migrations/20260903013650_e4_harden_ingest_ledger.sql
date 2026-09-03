alter function public.reject_append_only_mutation()
set search_path = pg_catalog;

create index ingest_receipts_prior_receipt_idx
on public.ingest_receipts (prior_receipt_id)
where prior_receipt_id is not null;
