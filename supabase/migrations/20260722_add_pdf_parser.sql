alter table public.invoices
  add column if not exists pdf_parser text;

comment on column public.invoices.pdf_parser is
  'Server-side parser that successfully extracted invoice text; never inferred for legacy rows.';
