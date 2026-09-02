-- A RPC create_customer_order aceita pix desde 20260827180000,
-- mas a constraint original só permitia credit/debit/cash.

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_method_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_method_check
  CHECK (
    payment_method IS NULL
    OR payment_method IN ('credit', 'debit', 'cash', 'pix')
  );

COMMENT ON COLUMN public.orders.payment_method IS
  'Forma de pagamento na entrega: credit, debit, cash ou pix';
