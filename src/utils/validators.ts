import { z } from 'zod';
import { SUPPORTED_CURRENCIES } from './money';
import { requiresStateForCountry } from './countryConfig';

// ─── Country Name → ISO Code Normalization ──────────────────

const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  'UNITED KINGDOM': 'GB', 'UK': 'GB', 'GREAT BRITAIN': 'GB', 'ENGLAND': 'GB',
  'UNITED STATES': 'US', 'USA': 'US', 'UNITED STATES OF AMERICA': 'US',
  'EGYPT': 'EG', 'NIGERIA': 'NG', 'SOUTH AFRICA': 'ZA', 'KENYA': 'KE', 'GHANA': 'GH',
  'CANADA': 'CA', 'AUSTRALIA': 'AU', 'NEW ZEALAND': 'NZ',
  'FRANCE': 'FR', 'GERMANY': 'DE', 'SPAIN': 'ES', 'ITALY': 'IT',
  'NETHERLANDS': 'NL', 'BELGIUM': 'BE', 'PORTUGAL': 'PT', 'POLAND': 'PL',
  'SWEDEN': 'SE', 'NORWAY': 'NO', 'DENMARK': 'DK', 'FINLAND': 'FI',
  'IRELAND': 'IE', 'SWITZERLAND': 'CH', 'AUSTRIA': 'AT', 'GREECE': 'GR',
  'TURKEY': 'TR', 'INDIA': 'IN', 'CHINA': 'CN', 'JAPAN': 'JP',
  'SOUTH KOREA': 'KR', 'SINGAPORE': 'SG', 'MALAYSIA': 'MY', 'THAILAND': 'TH',
  'INDONESIA': 'ID', 'PHILIPPINES': 'PH', 'VIETNAM': 'VN',
  'BRAZIL': 'BR', 'ARGENTINA': 'AR', 'MEXICO': 'MX', 'CHILE': 'CL',
  'COLOMBIA': 'CO', 'PERU': 'PE', 'ISRAEL': 'IL',
  'UAE': 'AE', 'UNITED ARAB EMIRATES': 'AE', 'SAUDI ARABIA': 'SA',
  'QATAR': 'QA', 'KUWAIT': 'KW', 'BAHRAIN': 'BH', 'OMAN': 'OM',
  'PAKISTAN': 'PK', 'BANGLADESH': 'BD', 'SRI LANKA': 'LK',
  'MOROCCO': 'MA', 'TUNISIA': 'TN', 'ALGERIA': 'DZ',
  'CAMEROON': 'CM', 'SENEGAL': 'SN', 'IVORY COAST': 'CI', "COTE D'IVOIRE": 'CI',
  'TANZANIA': 'TZ', 'UNITED REPUBLIC OF TANZANIA': 'TZ',
  'UGANDA': 'UG', 'ETHIOPIA': 'ET', 'RWANDA': 'RW',
  'TOGO': 'TG', 'GUINEA': 'GN', 'BURKINA FASO': 'BF',
  'ZIMBABWE': 'ZW', 'MALI': 'ML', 'BENIN': 'BJ',
  'CONGO': 'CG', 'REPUBLIC OF THE CONGO': 'CG',
  'DEMOCRATIC REPUBLIC OF THE CONGO': 'CD', 'DRC': 'CD',
  'DRC (DEMOCRATIC REPUBLIC OF THE CONGO)': 'CD',
  'SIERRA LEONE': 'SL', 'LIBERIA': 'LR', 'NIGER': 'NE', 'CHAD': 'TD',
  'GAMBIA': 'GM', 'GABON': 'GA', 'MOZAMBIQUE': 'MZ', 'ZAMBIA': 'ZM',
  'MADAGASCAR': 'MG', 'MALAWI': 'MW', 'BOTSWANA': 'BW', 'NAMIBIA': 'NA',
  'ANGOLA': 'AO', 'SOMALIA': 'SO', 'SUDAN': 'SD', 'SOUTH SUDAN': 'SS',
  'LIBYA': 'LY', 'MAURITIUS': 'MU', 'SEYCHELLES': 'SC',
};

/**
 * Normalize a country value (name, code, or mixed) to an ISO 3166-1 alpha-2 code.
 * Returns the 2-letter code or the original string uppercased if unrecognized.
 */
export function normalizeCountryCode(country: string): string {
  if (!country) return 'GB';
  const upper = country.toUpperCase().trim();
  if (upper.length === 2) return upper;
  return COUNTRY_NAME_TO_ISO[upper] ?? upper;
}

/**
 * Zod transform that accepts either an ISO code or a full country name and normalizes to ISO.
 * Use this on DTOs that may receive legacy data.
 */
export const flexibleCountryCodeValidator = z
  .string()
  .min(1, 'Country is required')
  .transform((v) => normalizeCountryCode(v));

/**
 * Optional version for update schemas.
 */
export const flexibleCountryCodeOptional = z
  .string()
  .min(1)
  .transform((v) => normalizeCountryCode(v))
  .optional()
  .nullable();

// ─── ID Validators ──────────────────────────────────────────

/**
 * Custom validator for booking IDs.
 * Accepts BKG-YYYY-XXXXXXX (shipment bookings) and TCB-YYYY-XXXXXXX (travel courier bookings).
 */
export const bookingIdValidator = z
  .string()
  .regex(
    /^(BKG|TCB)-\d{4}-[0-9A-Z]{7,}$/,
    'Invalid booking ID format. Expected format: BKG-YYYY-XXXXXXX or TCB-YYYY-XXXXXXX'
  );

/**
 * Custom validator for payment IDs in format: PAY-YYYY-XXXXXXX
 * Example: PAY-2025-22A5726
 */
export const paymentIdValidator = z
  .string()
  .regex(
    /^PAY-\d{4}-[0-9A-Z]{7}$/,
    'Invalid payment ID format. Expected format: PAY-YYYY-XXXXXXX'
  );

/**
 * Custom validator for extra charge IDs in format: ECH-YYYY-XXXXXXX
 * Example: ECH-2025-00001A7
 */
export const extraChargeIdValidator = z
  .string()
  .regex(
    /^ECH-\d{4}-[0-9A-Z]{7}$/,
    'Invalid extra charge ID format. Expected format: ECH-YYYY-XXXXXXX'
  );

/**
 * Custom validator for payment or extra charge IDs
 * Accepts both PAY-YYYY-XXXXXXX and ECH-YYYY-XXXXXXX formats
 * Used in company payments API where both types are returned
 */
export const paymentOrExtraChargeIdValidator = z
  .string()
  .regex(
    /^(PAY|ECH)-\d{4}-[0-9A-Z]{7}$/,
    'Invalid ID format. Expected format: PAY-YYYY-XXXXXXX or ECH-YYYY-XXXXXXX'
  );

// ─── ISO Validators ─────────────────────────────────────────

const ISO_COUNTRY_CODE_RE = /^[A-Z]{2}$/;

export const isoCountryCodeValidator = z
  .string()
  .transform((v) => v.toUpperCase())
  .pipe(
    z.string().regex(ISO_COUNTRY_CODE_RE, 'Must be a valid ISO 3166-1 alpha-2 country code (e.g. GB, US)')
  );

export const isoCurrencyCodeValidator = z
  .string()
  .transform((v) => v.toUpperCase())
  .pipe(z.enum(SUPPORTED_CURRENCIES));

// ─── Address Schema ─────────────────────────────────────────

export const addressSchema = z.object({
  countryCode: isoCountryCodeValidator,
  addressLine1: z.string().min(1, 'Address line 1 is required'),
  addressLine2: z.string().optional().nullable(),
  city: z.string().min(1, 'City is required'),
  stateOrProvince: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
}).refine(
  (data) => {
    if (requiresStateForCountry(data.countryCode)) {
      return !!data.stateOrProvince;
    }
    return true;
  },
  {
    message: 'State/province is required for this country',
    path: ['stateOrProvince'],
  }
);

export type AddressInput = z.infer<typeof addressSchema>;

// ─── Money Amount Validator ─────────────────────────────────

export const amountMinorValidator = z
  .number()
  .int('Amount must be an integer (minor units — no decimals)')
  .nonnegative('Amount must be non-negative');

export const positiveAmountMinorValidator = z
  .number()
  .int('Amount must be an integer (minor units — no decimals)')
  .positive('Amount must be positive');

