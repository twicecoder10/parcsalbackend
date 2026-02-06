/**
 * Script: Login as company, list current warehouses, then create warehouses for any
 * slot countries that don't have one yet. Uses the same 10 countries as the
 * Africa & West Europe slots: UK, Ivory Coast, Nigeria, Ghana, France, Spain,
 * Netherlands, Benin, Cameroon, Germany.
 *
 * Run: npx ts-node scripts/sync-warehouses-for-slot-countries.ts
 * Ensure BACKEND is running (e.g. npm run dev).
 */

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const EMAIL = 'hazeem4877@gmail.com';
const PASSWORD = 'Password123';

// Countries used in the 25 slots we created (must match create-slots-africa-europe.ts)
const SLOT_COUNTRIES = [
  'UK',
  'IVORY COAST',
  'NIGERIA',
  'GHANA',
  'FRANCE',
  'SPAIN',
  'NETHERLANDS',
  'BENIN',
  'CAMEROON',
  'GERMANY',
];

// Normalize country for comparison (API/DB may use "United Kingdom" or "Cote d'Ivoire" etc.)
function normalizeCountry(c: string): string {
  const u = c.toUpperCase().trim();
  if (u === 'UNITED KINGDOM') return 'UK';
  if (u === "COTE D'IVOIRE" || u === 'CÔTE D\'IVOIRE') return 'IVORY COAST';
  return u;
}

// One main city and a sample address per country (for new warehouses)
const COUNTRY_WAREHOUSE_DEFAULTS: Record<
  string,
  { city: string; address: string; postalCode?: string }
> = {
  UK: { city: 'London', address: '1 Logistics Way, London', postalCode: 'E1 6AN' },
  'IVORY COAST': { city: 'Abidjan', address: 'Zone 4, Treichville', postalCode: '01 BP 1' },
  NIGERIA: { city: 'Lagos', address: '12 Marina Road, Lagos Island', postalCode: '101001' },
  GHANA: { city: 'Accra', address: 'Ring Road West, Industrial Area', postalCode: 'GA-081' },
  FRANCE: { city: 'Paris', address: '15 Rue du Commerce', postalCode: '75015' },
  SPAIN: { city: 'Madrid', address: 'Calle de la Industria 8', postalCode: '28002' },
  NETHERLANDS: { city: 'Amsterdam', address: 'Havenweg 42', postalCode: '1043 AA' },
  BENIN: { city: 'Cotonou', address: 'Boulevard de la Marina', postalCode: '01 BP 01' },
  CAMEROON: { city: 'Douala', address: 'Bonaberi Industrial Zone', postalCode: '00237' },
  GERMANY: { city: 'Berlin', address: 'Lagerstraße 1', postalCode: '10365' },
};

async function login(): Promise<string> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as {
    data?: { tokens?: { accessToken?: string }; user?: { role?: string; companyId?: string } };
  };
  const token = json?.data?.tokens?.accessToken;
  if (!token) throw new Error('No access token in login response');
  const role = json?.data?.user?.role;
  const companyId = json?.data?.user?.companyId;
  if (role !== 'COMPANY_ADMIN' || !companyId) {
    throw new Error(`User is not a company admin or has no company. role=${role}, companyId=${companyId}`);
  }
  console.log('Logged in as company admin, companyId:', companyId);
  return token;
}

async function listWarehouses(token: string): Promise<{ country: string; city: string; name: string }[]> {
  const res = await fetch(`${BASE_URL}/companies/warehouses`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`List warehouses failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { data?: Array<{ country: string; city: string; name: string }> };
  const list = json?.data ?? [];
  return list;
}

async function createWarehouse(
  token: string,
  body: { name: string; address: string; city: string; country: string; state?: string; postalCode?: string; isDefault?: boolean }
): Promise<{ id: string; country: string; city: string }> {
  const res = await fetch(`${BASE_URL}/companies/warehouses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create warehouse failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { data?: { id: string; country: string; city: string } };
  const data = json?.data;
  if (!data?.id) throw new Error('No warehouse id in response');
  return { id: data.id, country: data.country, city: data.city };
}

async function main() {
  console.log('API base URL:', BASE_URL);
  const token = await login();

  const existing = await listWarehouses(token);
  const existingCountries = new Set(existing.map((w) => normalizeCountry(w.country)));
  console.log('Current warehouses:', existing.length);
  existing.forEach((w) => console.log('  -', w.name, '|', w.city + ',', w.country));

  const missing = SLOT_COUNTRIES.filter((c) => !existingCountries.has(normalizeCountry(c)));
  if (missing.length === 0) {
    console.log('\nAll slot countries already have at least one warehouse. Nothing to create.');
    return;
  }
  console.log('\nCountries with slots but no warehouse:', missing.join(', '));

  let firstNew = true;
  for (const country of missing) {
    const def = COUNTRY_WAREHOUSE_DEFAULTS[country];
    if (!def) {
      console.warn('  Skip (no default address):', country);
      continue;
    }
    const name = `${def.city} Warehouse`;
    const created = await createWarehouse(token, {
      name,
      address: def.address,
      city: def.city,
      country,
      postalCode: def.postalCode,
      isDefault: firstNew && existing.length === 0,
    });
    firstNew = false;
    console.log('  Created:', created.country, '|', created.city, '|', name);
  }
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
