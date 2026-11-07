-- The external payment gateway's provider code changes; rows keep their history.
UPDATE "PaymentProvider" SET "providerName" = 'gateway' WHERE "providerName" = 'managed';
UPDATE "Payment" SET "provider" = 'gateway' WHERE "provider" = 'managed';
UPDATE "PaymentMethod" SET "provider" = 'gateway' WHERE "provider" = 'managed';
UPDATE "LedgerAccount" SET "provider" = 'gateway' WHERE "provider" = 'managed';
UPDATE "ProviderEvent" SET "provider" = 'gateway' WHERE "provider" = 'managed';
UPDATE "MoneyIntent" SET "provider" = 'gateway' WHERE "provider" = 'managed';
