-- Partial payments: what has been paid on an invoice so far.
ALTER TABLE "Invoice" ADD COLUMN "amountPaid" DECIMAL(19,4) NOT NULL DEFAULT 0;
-- Invoices already paid were paid in full.
UPDATE "Invoice" SET "amountPaid" = "amount" WHERE "status" = 'PAID';
