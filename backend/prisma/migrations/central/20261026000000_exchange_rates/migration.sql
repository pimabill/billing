-- Daily exchange rates: units of a currency per one US dollar.
CREATE TABLE "ExchangeRate" (
    "date" DATE NOT NULL,
    "currency" TEXT NOT NULL,
    "perUsd" DECIMAL(24,10) NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("date","currency")
);
CREATE INDEX "ExchangeRate_currency_date_idx" ON "ExchangeRate"("currency", "date");
