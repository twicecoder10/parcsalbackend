/**
 * Create additional AIR-only PER_KG slots to ensure Ghana, Togo, and Nigeria
 * are included in the dataset, respecting corridor rules:
 *   - Africa <-> Europe
 *   - USA <-> Africa
 *
 * Run:
 *   npx ts-node scripts/create-slots-include-ghana-togo-nigeria.ts
 */

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const EMAIL = process.env.COMPANY_EMAIL || 'hazeem4877@gmail.com';
const PASSWORD = process.env.COMPANY_PASSWORD || 'Password123';

const EUROPE = [
  'UK',
  'Ireland',
  'France',
  'Spain',
  'Italy',
  'Germany',
  'Netherlands',
  'Belgium',
  'Switzerland',
] as const;

const AFRICA = [
  'Senegal',
  'Mali',
  'Guinea',
  'Togo',
  'Burkina Faso',
  'Congo',
  'DRC (Democratic Republic of the Congo)',
  'South Africa',
  'Zimbabwe',
  'Tanzania',
  'Morocco',
  'Algeria',
  'Benin',
  'Cameroon',
  'Ghana',
  'Ivory Coast',
  'Nigeria',
] as const;

const USA = 'USA' as const;

const COUNTRY_CITIES: Record<string, string[]> = {
  // Europe
  UK: ['London', 'Manchester'],
  Ireland: ['Dublin'],
  France: ['Paris', 'Lyon'],
  Spain: ['Madrid', 'Barcelona'],
  Italy: ['Rome', 'Milan'],
  Germany: ['Frankfurt', 'Berlin'],
  Netherlands: ['Amsterdam', 'Rotterdam'],
  Belgium: ['Brussels'],
  Switzerland: ['Zurich', 'Geneva'],
  // Americas
  USA: ['New York', 'Atlanta', 'Washington DC'],
  // Africa (focus countries included)
  Ghana: ['Accra'],
  Togo: ['Lomé'],
  Nigeria: ['Lagos', 'Abuja'],
};

type CorridorType = 'EUROPE_AFRICA' | 'USA_AFRICA';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: readonly T[] | T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function corridorType(originCountry: string, destinationCountry: string): CorridorType {
  const originIsAfrica = (AFRICA as readonly string[]).includes(originCountry);
  const destIsAfrica = (AFRICA as readonly string[]).includes(destinationCountry);
  const originIsEurope = (EUROPE as readonly string[]).includes(originCountry);
  const destIsEurope = (EUROPE as readonly string[]).includes(destinationCountry);

  if ((originIsAfrica && destIsEurope) || (originIsEurope && destIsAfrica)) return 'EUROPE_AFRICA';

  const originIsUSA = originCountry === USA;
  const destIsUSA = destinationCountry === USA;
  if ((originIsUSA && destIsAfrica) || (destIsUSA && originIsAfrica)) return 'USA_AFRICA';

  throw new Error(`Invalid corridor: ${originCountry} -> ${destinationCountry}`);
}

function pricePerKgFor(corridor: CorridorType): number {
  if (corridor === 'EUROPE_AFRICA') return round2(9 + Math.random() * 6); // 9–15
  return round2(14 + Math.random() * 6); // 14–20
}

function flightDurationMinutes(corridor: CorridorType): number {
  // Simple realistic ranges for West Africa focus (Ghana/Togo/Nigeria) plus a bit of buffer
  let minH: number;
  let maxH: number;
  if (corridor === 'USA_AFRICA') {
    minH = 8.0;
    maxH = 11.5;
  } else {
    minH = 5.0;
    maxH = 7.5;
  }
  const flightMinutes = Math.round((minH * 60) + Math.random() * ((maxH - minH) * 60));
  return flightMinutes + randomInt(25, 55);
}

function pickCity(country: string): string {
  const cities = COUNTRY_CITIES[country] || [country + ' City'];
  return randomChoice(cities);
}

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
  return token;
}

type ShipmentListItem = { id: string; departureTime: string };

async function listAllDepartureDates(token: string): Promise<Set<string>> {
  const used = new Set<string>();
  const limit = 100;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const res = await fetch(`${BASE_URL}/companies/shipments?limit=${limit}&offset=${offset}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`List shipments failed (${res.status}): ${await res.text()}`);
    const json = (await res.json()) as { data?: ShipmentListItem[]; pagination?: { hasMore: boolean } };
    const data = json?.data ?? [];
    data.forEach((s) => used.add(s.departureTime.slice(0, 10)));
    if (!data.length || json?.pagination?.hasMore === false) hasMore = false;
    else offset += limit;
    if (data.length < limit) hasMore = false;
  }

  return used;
}

async function createWarehouse(token: string, country: string) {
  const city = pickCity(country);
  const res = await fetch(`${BASE_URL}/companies/warehouses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: `${city} Warehouse`,
      address: `${city} International Cargo Terminal`,
      city,
      country,
      postalCode: '',
      isDefault: false,
    }),
  });
  if (!res.ok) throw new Error(`Create warehouse failed (${res.status}): ${await res.text()}`);
}

async function ensureWarehouse(token: string, country: string) {
  const res = await fetch(`${BASE_URL}/companies/warehouses`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`List warehouses failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { data?: Array<{ country: string }> };
  const set = new Set((json.data ?? []).map((w) => w.country));
  if (!set.has(country)) await createWarehouse(token, country);
}

async function createShipment(token: string, payload: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${BASE_URL}/companies/shipments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Create shipment failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { data?: { id?: string } };
  if (!json?.data?.id) throw new Error('No shipment id in response');
  return json.data.id;
}

function buildNotes(originCountry: string, destinationCountry: string, corridor: CorridorType): string {
  const lane = corridor === 'USA_AFRICA' ? 'USA ↔ Africa lane' : 'Europe ↔ Africa lane';
  const extras = [
    'No hazardous materials, liquids, or batteries. Proper packaging required.',
    'Customs paperwork required (invoice + packing list).',
    'Arrive before cutoff; late drop-offs may be moved to the next flight.',
  ];
  return `Route: ${originCountry} → ${destinationCountry}. ${lane}. ${randomChoice(extras)}`;
}

async function main() {
  console.log('API base URL:', BASE_URL);
  const token = await login();

  // Ensure warehouses for the focus countries + USA and at least one Europe hub
  const mustHaveCountries = ['Ghana', 'Togo', 'Nigeria', 'USA', 'UK', 'France'];
  for (const c of mustHaveCountries) {
    await ensureWarehouse(token, c);
  }

  const usedDates = await listAllDepartureDates(token);

  // Create 6 additional slots that explicitly include Ghana, Togo, Nigeria (2 each)
  const recipes: Array<{ origin: string; dest: string }> = [
    { origin: 'UK', dest: 'Ghana' },
    { origin: 'Ghana', dest: 'France' },
    { origin: 'USA', dest: 'Togo' },
    { origin: 'Togo', dest: 'Spain' },
    { origin: 'Italy', dest: 'Nigeria' },
    { origin: 'Nigeria', dest: 'USA' },
  ];

  let created = 0;
  for (const r of recipes) {
    const corridor = corridorType(r.origin, r.dest);

    // pick a unique date between 1–6 months
    let daysFromNow = randomInt(30, 180);
    let dep = addDays(new Date(), daysFromNow);
    dep.setUTCHours(randomInt(6, 21), randomChoice([0, 30]), 0, 0);
    while (usedDates.has(dep.toISOString().slice(0, 10))) {
      daysFromNow = randomInt(30, 180);
      dep = addDays(new Date(), daysFromNow);
      dep.setUTCHours(randomInt(6, 21), randomChoice([0, 30]), 0, 0);
    }
    usedDates.add(dep.toISOString().slice(0, 10));

    const durationMin = flightDurationMinutes(corridor);
    const arr = addMinutes(dep, durationMin);
    const cutoff = addMinutes(dep, -randomInt(24, 72) * 60);

    const originCity = pickCity(r.origin);
    const destinationCity = pickCity(r.dest);
    const pricePerKg = pricePerKgFor(corridor);
    const totalCapacityKg = randomInt(200, 1200);

    const payload = {
      originCountry: r.origin,
      originCity,
      destinationCountry: r.dest,
      destinationCity,
      departureTime: dep.toISOString(),
      arrivalTime: arr.toISOString(),
      mode: 'AIR',
      totalCapacityKg,
      pricingModel: 'PER_KG',
      pricePerKg,
      cutoffTimeForReceivingItems: cutoff.toISOString(),
      status: 'PUBLISHED',
      bookingNotes: buildNotes(r.origin, r.dest, corridor),
      allowsPickupFromSender: true,
      allowsDropOffAtCompany: true,
      allowsDeliveredToReceiver: true,
      allowsReceiverPicksUp: true,
    };

    const id = await createShipment(token, payload);
    created++;
    console.log(
      `  +${created}/6 ${r.origin} (${originCity}) -> ${r.dest} (${destinationCity}) | ${dep.toISOString().slice(0, 10)} | ${corridor} | £${pricePerKg}/kg | id ${id}`
    );
  }

  console.log('Done. Created', created, 'additional slots including Ghana, Togo, and Nigeria.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

