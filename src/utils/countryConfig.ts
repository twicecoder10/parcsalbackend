import { SupportedCurrency } from './money';

// ─── Weight Units ───────────────────────────────────────────

export type WeightUnit = 'KG' | 'LB';

// ─── Country Configuration ──────────────────────────────────

export interface CountryConfig {
  currency: SupportedCurrency;
  weightUnit: WeightUnit;
  postalLabel: string;
  requiresState: boolean;
}

const COUNTRY_CONFIGS: Record<string, CountryConfig> = {
  GB: { currency: 'GBP', weightUnit: 'KG', postalLabel: 'Postcode', requiresState: false },
  US: { currency: 'USD', weightUnit: 'LB', postalLabel: 'ZIP Code', requiresState: true },
  CA: { currency: 'CAD', weightUnit: 'LB', postalLabel: 'Postal Code', requiresState: true },

  // Eurozone
  DE: { currency: 'EUR', weightUnit: 'KG', postalLabel: 'Postleitzahl', requiresState: false },
  FR: { currency: 'EUR', weightUnit: 'KG', postalLabel: 'Code Postal', requiresState: false },
  ES: { currency: 'EUR', weightUnit: 'KG', postalLabel: 'Código Postal', requiresState: false },
  IT: { currency: 'EUR', weightUnit: 'KG', postalLabel: 'CAP', requiresState: true },
  NL: { currency: 'EUR', weightUnit: 'KG', postalLabel: 'Postcode', requiresState: false },
  BE: { currency: 'EUR', weightUnit: 'KG', postalLabel: 'Code Postal', requiresState: false },
  AT: { currency: 'EUR', weightUnit: 'KG', postalLabel: 'Postleitzahl', requiresState: false },
  PT: { currency: 'EUR', weightUnit: 'KG', postalLabel: 'Código Postal', requiresState: false },
  IE: { currency: 'EUR', weightUnit: 'KG', postalLabel: 'Eircode', requiresState: false },

  // West Africa (commonly GBP-pegged or USD for shipping)
  NG: { currency: 'GBP', weightUnit: 'KG', postalLabel: 'Postal Code', requiresState: true },
  GH: { currency: 'GBP', weightUnit: 'KG', postalLabel: 'Postal Code', requiresState: false },
};

const DEFAULT_CONFIG: CountryConfig = {
  currency: 'GBP',
  weightUnit: 'KG',
  postalLabel: 'Postal Code',
  requiresState: false,
};

export function getCountryConfig(countryCode: string): CountryConfig {
  return COUNTRY_CONFIGS[countryCode.toUpperCase()] ?? DEFAULT_CONFIG;
}

export function requiresStateForCountry(countryCode: string): boolean {
  return getCountryConfig(countryCode).requiresState;
}

export function getDefaultCurrency(countryCode: string): SupportedCurrency {
  return getCountryConfig(countryCode).currency;
}

export function getSupportedCountryCodes(): string[] {
  return Object.keys(COUNTRY_CONFIGS);
}
