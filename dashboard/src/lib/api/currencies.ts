import { apiFetch } from "./client";

export interface CustomCurrency {
  code: string;
  name: string;
  symbol: string | null;
  decimals: number;
  /** Units per one US dollar; null when it is not converted. */
  perUsd: number | null;
}

export interface CurrencySettings {
  reportingCurrency: string;
  ratesAsOf: string | null;
  inUse: { code: string; name: string; decimals: number; custom: boolean; perReporting: number | null }[];
  custom: CustomCurrency[];
  iso: { code: string; name: string; decimals: number }[];
}

export const currenciesApi = {
  settings: () => apiFetch<CurrencySettings>("/currencies/settings"),
  setReporting: (currency: string) =>
    apiFetch<{ reportingCurrency: string }>("/currencies/reporting", { method: "PUT", body: JSON.stringify({ currency }) }),
  create: (body: { code: string; name: string; symbol?: string; decimals?: number; perUsd?: number }) =>
    apiFetch<CustomCurrency>("/currencies/custom", { method: "POST", body: JSON.stringify(body) }),
  update: (code: string, body: Partial<Omit<CustomCurrency, "code">>) =>
    apiFetch<CustomCurrency>(`/currencies/custom/${encodeURIComponent(code)}`, { method: "PATCH", body: JSON.stringify(body) }),
  remove: (code: string) => apiFetch<void>(`/currencies/custom/${encodeURIComponent(code)}`, { method: "DELETE" }),
};
