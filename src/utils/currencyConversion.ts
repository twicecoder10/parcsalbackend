import { SupportedCurrency } from './money';

/**
 * Mock exchange rates relative to GBP (1 GBP = X of target).
 * These are placeholder rates for display purposes only — NOT for payments.
 */
const RATES_FROM_GBP: Record<SupportedCurrency, number> = {
  GBP: 1.0,
  USD: 1.27,
  EUR: 1.17,
  CAD: 1.72,
};

function rateFromTo(from: SupportedCurrency, to: SupportedCurrency): number {
  if (from === to) return 1;
  return RATES_FROM_GBP[to] / RATES_FROM_GBP[from];
}

/**
 * Convert an amount in minor units from one currency to another using mock rates.
 * This is for **display only** — actual payment must always be charged in the listing's currency.
 */
export function convertCurrency(
  amountMinor: number,
  fromCurrency: SupportedCurrency,
  toCurrency: SupportedCurrency,
): number {
  if (fromCurrency === toCurrency) return amountMinor;
  const rate = rateFromTo(fromCurrency, toCurrency);
  return Math.round(amountMinor * rate);
}

/**
 * Return the mock exchange rate between two currencies.
 */
export function getExchangeRate(
  fromCurrency: SupportedCurrency,
  toCurrency: SupportedCurrency,
): number {
  return rateFromTo(fromCurrency, toCurrency);
}
