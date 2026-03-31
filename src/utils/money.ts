import { z } from 'zod';

// ─── Supported Currencies ───────────────────────────────────

export const SUPPORTED_CURRENCIES = ['GBP', 'USD', 'EUR', 'CAD'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const currencyZodEnum = z.enum(SUPPORTED_CURRENCIES);

// ─── Money Type ─────────────────────────────────────────────

export interface Money {
  amountMinor: number;
  currency: SupportedCurrency;
}

export const moneySchema = z.object({
  amountMinor: z.number().int('Amount must be an integer (minor units)'),
  currency: currencyZodEnum,
});

/**
 * Number of minor units per major unit for each currency.
 * All currently supported currencies use 100 (cents/pence).
 */
export const CURRENCY_MINOR_UNITS: Record<SupportedCurrency, number> = {
  GBP: 100,
  USD: 100,
  EUR: 100,
  CAD: 100,
};

export function minorToMajor(amountMinor: number, currency: SupportedCurrency): number {
  return amountMinor / CURRENCY_MINOR_UNITS[currency];
}

export function majorToMinor(amountMajor: number, currency: SupportedCurrency): number {
  return Math.round(amountMajor * CURRENCY_MINOR_UNITS[currency]);
}

/**
 * Format a minor-unit amount for display. E.g. formatMoney({ amountMinor: 1050, currency: 'GBP' }) => "£10.50"
 */
export function formatMoney(money: Money): string {
  const symbols: Record<SupportedCurrency, string> = {
    GBP: '£',
    USD: '$',
    EUR: '€',
    CAD: 'CA$',
  };
  const major = minorToMajor(money.amountMinor, money.currency);
  return `${symbols[money.currency]}${major.toFixed(2)}`;
}

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value.toUpperCase());
}

export function assertSameCurrency(a: SupportedCurrency, b: SupportedCurrency): void {
  if (a !== b) {
    throw new Error(`Currency mismatch: expected ${a}, got ${b}`);
  }
}
