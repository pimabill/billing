/** Currencies PayPal takes payments in; keep in step with the backend's PAYPAL_CURRENCIES. */
export const PAYPAL_CURRENCIES = new Set(["AUD", "BRL", "CAD", "CNY", "CZK", "DKK", "EUR", "HKD", "HUF", "ILS", "JPY", "MYR", "MXN", "TWD", "NZD", "NOK", "PHP", "PLN", "GBP", "SGD", "SEK", "CHF", "THB", "USD"]);

export type CheckoutMethod = "card" | "mobile_money" | "paypal";
