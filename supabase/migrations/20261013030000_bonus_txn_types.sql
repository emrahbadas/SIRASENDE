-- Ledger transaction types for bonus coins (own migration: a new enum value
-- cannot be used in the transaction that adds it).
alter type public.ledger_txn_type add value if not exists 'bonus_grant';
alter type public.ledger_txn_type add value if not exists 'bonus_expiry';
