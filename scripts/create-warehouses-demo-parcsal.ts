/**
 * Login as demo@parcsal.com and ensure at least one warehouse exists in each
 * specified country (using the country names EXACTLY as provided).
 *
 * Run:
 *   npx ts-node scripts/create-warehouses-demo-parcsal.ts
 *
 * Env overrides:
 *   API_BASE_URL=http://localhost:4000
 *   COMPANY_EMAIL=demo@parcsal.com
 *   COMPANY_PASSWORD=Demo12345
 */

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const EMAIL = process.env.COMPANY_EMAIL || 'demo@parcsal.com';
const PASSWORD = process.env.COMPANY_PASSWORD || 'Demo12345';

const COUNTRIES: Array<{
  country: string;
  city: string;
  address: string;
  postalCode?: string;
}> = [
  { country: 'United Kingdom', city: 'London', address: 'London Cargo Terminal, Heathrow' },
  { country: 'Ireland', city: 'Dublin', address: 'Dublin Port Logistics Park' },
  { country: 'France', city: 'Paris', address: 'Paris Freight Centre' },
  { country: 'Spain', city: 'Madrid', address: 'Madrid Logistics Hub' },
  { country: 'Italy', city: 'Milan', address: 'Milan Cargo & Consolidation Centre' },
  { country: 'Germany', city: 'Berlin', address: 'Berlin Freight Depot' },
  { country: 'Netherlands', city: 'Amsterdam', address: 'Amsterdam Cargo Terminal' },
  { country: 'Belgium', city: 'Brussels', address: 'Brussels Logistics Centre' },
  { country: 'Switzerland', city: 'Zurich', address: 'Zurich Cargo Handling Centre' },
  { country: 'United States of America', city: 'New York', address: 'NY/NJ Port & Cargo Facility' },
  { country: 'Senegal', city: 'Dakar', address: 'Dakar Port Cargo Area' },
  { country: 'Mali', city: 'Bamako', address: 'Bamako Freight & Warehouse District' },
  { country: 'Guinea', city: 'Conakry', address: 'Conakry Port Logistics Zone' },
  { country: 'Togo', city: 'Lomé', address: 'Lomé Port Cargo Terminal' },
  { country: 'Burkina Faso', city: 'Ouagadougou', address: 'Ouagadougou Logistics Hub' },
  { country: 'Democratic Republic of the Congo', city: 'Kinshasa', address: 'Kinshasa Cargo Consolidation Depot' },
  { country: 'Republic of the Congo', city: 'Brazzaville', address: 'Brazzaville Freight Depot' },
  { country: 'South Africa', city: 'Johannesburg', address: 'Johannesburg Freight & Courier Hub' },
  { country: 'Zimbabwe', city: 'Harare', address: 'Harare Cargo & Warehouse Park' },
  { country: 'United Republic of Tanzania', city: 'Dar es Salaam', address: 'Dar es Salaam Port Logistics Zone' },
  { country: 'Morocco', city: 'Casablanca', address: 'Casablanca Logistics & Cargo Terminal' },
  { country: 'Algeria', city: 'Algiers', address: 'Algiers Freight Depot' },
  { country: 'Benin', city: 'Cotonou', address: 'Cotonou Port Logistics Area' },
  { country: 'Cameroon', city: 'Douala', address: 'Douala Port & Cargo Handling' },
  { country: 'Ghana', city: 'Accra', address: 'Accra Cargo Terminal' },
  { country: 'Cote d\'Ivoire', city: 'Abidjan', address: 'Abidjan Port Logistics Zone' },
  { country: 'Nigeria', city: 'Lagos', address: 'Lagos Logistics & Cargo Hub' },
];

async function login(): Promise<string> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed (${res.status}): ${await res.text()}`);
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
  console.log('Logged in. companyId:', companyId);
  return token;
}

type Warehouse = { id: string; country: string; city: string; name: string };

async function listWarehouses(token: string): Promise<Warehouse[]> {
  const res = await fetch(`${BASE_URL}/companies/warehouses`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`List warehouses failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { data?: Warehouse[] };
  return json?.data ?? [];
}

async function createWarehouse(
  token: string,
  body: { name: string; address: string; city: string; country: string; postalCode?: string; isDefault?: boolean }
): Promise<string> {
  const res = await fetch(`${BASE_URL}/companies/warehouses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Create warehouse failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { data?: { id?: string } };
  if (!json?.data?.id) throw new Error('No warehouse id in response');
  return json.data.id;
}

async function main() {
  console.log('API base URL:', BASE_URL);
  const token = await login();

  const existing = await listWarehouses(token);
  const existingByCountry = new Map<string, Warehouse[]>();
  for (const w of existing) {
    const list = existingByCountry.get(w.country) || [];
    list.push(w);
    existingByCountry.set(w.country, list);
  }

  console.log('Existing warehouses:', existing.length);

  let created = 0;
  for (const c of COUNTRIES) {
    const already = existingByCountry.get(c.country);
    if (already && already.length > 0) {
      console.log(`  OK: ${c.country} (already has ${already.length})`);
      continue;
    }

    const name = `${c.city} Warehouse`;
    const id = await createWarehouse(token, {
      name,
      address: c.address,
      city: c.city,
      country: c.country,
      postalCode: c.postalCode || '',
      isDefault: false,
    });
    created++;
    console.log(`  CREATED: ${c.country} | ${c.city} | ${id}`);
  }

  console.log('Done. Created', created, 'warehouse(s).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

