/**
 * Create 30 realistic AIR-only PER_KG shipment slots for a company.
 *
 * Rules:
 * - Routes ONLY between: Africa <-> Europe, and USA <-> Africa
 * - Supported countries:
 *   Europe: UK, Ireland, France, Spain, Italy, Germany, Netherlands, Belgium, Switzerland
 *   Americas: USA
 *   Africa: Senegal, Mali, Guinea, Togo, Burkina Faso, Congo, DRC (Democratic Republic of the Congo),
 *           South Africa, Zimbabwe, Tanzania, Morocco, Algeria, Benin, Cameroon, Ghana,
 *           Ivory Coast, Nigeria
 * - MODE: AIR only
 * - Price model: PER_KG
 * - Prices:
 *   - Europe/Africa: 9–15
 *   - USA/Africa: 14–20
 * - Times: realistic flight times
 * - Each slot must have a unique departure DATE within next 1–6 months
 * - Realistic capacities, cutoffs, and notes
 *
 * Run:
 *   npx ts-node scripts/create-30-slots-air-perkg-africa-europe-usa.ts
 *
 * Env overrides:
 *   API_BASE_URL=http://localhost:4000
 *   COMPANY_EMAIL=hazeem4877@gmail.com
 *   COMPANY_PASSWORD=Password123
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
  // Africa
  Senegal: ['Dakar'],
  Mali: ['Bamako'],
  Guinea: ['Conakry'],
  Togo: ['Lomé'],
  'Burkina Faso': ['Ouagadougou'],
  Congo: ['Brazzaville', 'Pointe-Noire'],
  'DRC (Democratic Republic of the Congo)': ['Kinshasa'],
  'South Africa': ['Johannesburg', 'Cape Town'],
  Zimbabwe: ['Harare'],
  Tanzania: ['Dar es Salaam'],
  Morocco: ['Casablanca', 'Marrakesh'],
  Algeria: ['Algiers'],
  Benin: ['Cotonou'],
  Cameroon: ['Douala', 'Yaoundé'],
  Ghana: ['Accra'],
  'Ivory Coast': ['Abidjan'],
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

  if ((originIsAfrica && destIsEurope) || (originIsEurope && destIsAfrica)) {
    return 'EUROPE_AFRICA';
  }

  const originIsUSA = originCountry === USA;
  const destIsUSA = destinationCountry === USA;
  if ((originIsUSA && destIsAfrica) || (destIsUSA && originIsAfrica)) {
    return 'USA_AFRICA';
  }

  throw new Error(`Invalid corridor: ${originCountry} -> ${destinationCountry}`);
}

function pricePerKgFor(corridor: CorridorType): number {
  if (corridor === 'EUROPE_AFRICA') {
    return round2(9 + Math.random() * 6); // 9–15
  }
  return round2(14 + Math.random() * 6); // 14–20
}

function flightDurationMinutes(corridor: CorridorType, africaCountry: string): number {
  const northAfrica = new Set(['Morocco', 'Algeria']);
  const southAfrica = new Set(['South Africa', 'Zimbabwe', 'Tanzania']);
  const centralAfrica = new Set(['Congo', 'DRC (Democratic Republic of the Congo)', 'Cameroon']);

  let minH: number;
  let maxH: number;

  if (corridor === 'USA_AFRICA') {
    if (northAfrica.has(africaCountry)) {
      minH = 7.5;
      maxH = 10.5;
    } else if (southAfrica.has(africaCountry)) {
      minH = 14.5;
      maxH = 18.5;
    } else if (centralAfrica.has(africaCountry)) {
      minH = 10.5;
      maxH = 14.5;
    } else {
      // West Africa
      minH = 8.0;
      maxH = 11.5;
    }
  } else {
    // EUROPE_AFRICA
    if (northAfrica.has(africaCountry)) {
      minH = 2.5;
      maxH = 4.5;
    } else if (southAfrica.has(africaCountry)) {
      minH = 9.5;
      maxH = 12.5;
    } else if (centralAfrica.has(africaCountry)) {
      minH = 6.0;
      maxH = 8.5;
    } else {
      // West Africa
      minH = 4.5;
      maxH = 7.5;
    }
  }

  const flightMinutes = Math.round((minH * 60) + Math.random() * ((maxH - minH) * 60));
  const taxiAndBuffer = randomInt(25, 55);
  return flightMinutes + taxiAndBuffer;
}

function pickCity(country: string): string {
  const cities = COUNTRY_CITIES[country];
  if (!cities || cities.length === 0) {
    throw new Error(`No cities configured for ${country}`);
  }
  return randomChoice(cities);
}

function generateUniqueDepartureDays(count: number, minDays: number, maxDays: number): number[] {
  const s = new Set<number>();
  while (s.size < count) {
    s.add(randomInt(minDays, maxDays));
  }
  return Array.from(s).sort((a, b) => a - b);
}

function buildNotes(originCountry: string, destinationCountry: string, corridor: CorridorType): string {
  const base = [
    'No hazardous materials, batteries, liquids, or perishables. Valid ID required for all consignments.',
    'Arrive early for drop-off. Late drop-offs may be moved to the next available flight.',
    'Customs documentation must be complete (invoice/packing list). Additional inspection may apply.',
    'Fragile items must be securely packed. Company is not liable for damage due to inadequate packaging.',
    'Max single piece weight 30kg unless pre-approved. Oversized items may incur additional handling fees.',
  ];
  const corridorLine =
    corridor === 'USA_AFRICA'
      ? 'USA ↔ Africa lane: allow extra time for customs and screening.'
      : 'Europe ↔ Africa lane: customs checks apply at both ends.';

  return [
    `Route: ${originCountry} → ${destinationCountry}.`,
    corridorLine,
    randomChoice(base),
  ].join(' ');
}

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
  console.log('Logged in. companyId:', companyId);
  return token;
}

type Warehouse = { id: string; country: string; city: string; name: string };

async function listWarehouses(token: string): Promise<Warehouse[]> {
  const res = await fetch(`${BASE_URL}/companies/warehouses`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`List warehouses failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { data?: Warehouse[] };
  return json?.data ?? [];
}

async function createWarehouse(token: string, country: string): Promise<void> {
  const city = pickCity(country);
  const name = `${city} Warehouse`;
  const address = `${city} International Cargo Terminal`;
  const res = await fetch(`${BASE_URL}/companies/warehouses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name,
      address,
      city,
      country,
      postalCode: '',
      isDefault: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create warehouse failed for ${country} (${res.status}): ${text}`);
  }
  console.log('  Warehouse created for', country, `(${city})`);
}

async function ensureWarehouses(token: string, countriesNeeded: Set<string>): Promise<void> {
  const existing = await listWarehouses(token);
  const existingCountries = new Set(existing.map((w) => w.country));

  const missing = Array.from(countriesNeeded).filter((c) => !existingCountries.has(c));
  if (missing.length === 0) return;

  console.log('Creating missing warehouses for:', missing.join(', '));
  for (const c of missing) {
    await createWarehouse(token, c);
  }
}

async function createShipment(token: string, payload: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${BASE_URL}/companies/shipments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create shipment failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { data?: { id?: string; status?: string } };
  const id = json?.data?.id;
  if (!id) throw new Error('No shipment id in response');
  return id;
}

function pickRoute(): { originCountry: string; destinationCountry: string } {
  // 70% Europe<->Africa, 30% USA<->Africa
  const useUSA = Math.random() < 0.3;
  const africa = randomChoice(AFRICA);

  if (useUSA) {
    const directionUSAOutbound = Math.random() < 0.5;
    return directionUSAOutbound
      ? { originCountry: USA, destinationCountry: africa }
      : { originCountry: africa, destinationCountry: USA };
  }

  const europe = randomChoice(EUROPE);
  const directionEuropeOutbound = Math.random() < 0.5;
  return directionEuropeOutbound
    ? { originCountry: europe, destinationCountry: africa }
    : { originCountry: africa, destinationCountry: europe };
}

async function main() {
  console.log('API base URL:', BASE_URL);
  const token = await login();

  // Generate 30 unique departure dates between 1–6 months from now
  const departureDays = generateUniqueDepartureDays(30, 30, 180);

  // Prebuild routes and determine needed warehouse countries (exact match required for PUBLISHED)
  const planned = departureDays.map((daysFromNow, i) => {
    const { originCountry, destinationCountry } = pickRoute();
    const originCity = pickCity(originCountry);
    const destinationCity = pickCity(destinationCountry);

    const corridor = corridorType(originCountry, destinationCountry);
    const africaCountry = (AFRICA as readonly string[]).includes(originCountry) ? originCountry : destinationCountry;
    const durationMin = flightDurationMinutes(corridor, africaCountry);

    const dep = addDays(new Date(), daysFromNow);
    // random realistic departure time window
    dep.setUTCHours(randomInt(6, 21), randomChoice([0, 30]), 0, 0);
    const arr = addMinutes(dep, durationMin);
    const cutoffHours = randomInt(24, 72);
    const cutoff = addMinutes(dep, -cutoffHours * 60);

    const pricePerKg = pricePerKgFor(corridor);
    const totalCapacityKg = randomInt(180, 1200);

    const bookingNotes = buildNotes(originCountry, destinationCountry, corridor);

    const payload = {
      originCountry,
      originCity,
      destinationCountry,
      destinationCity,
      departureTime: dep.toISOString(),
      arrivalTime: arr.toISOString(),
      mode: 'AIR',
      totalCapacityKg,
      pricingModel: 'PER_KG',
      pricePerKg,
      cutoffTimeForReceivingItems: cutoff.toISOString(),
      status: 'PUBLISHED',
      bookingNotes,
      allowsPickupFromSender: true,
      allowsDropOffAtCompany: true,
      allowsDeliveredToReceiver: true,
      allowsReceiverPicksUp: true,
    };

    return { i, originCountry, destinationCountry, dep, arr, corridor, pricePerKg, totalCapacityKg, payload };
  });

  const neededCountries = new Set<string>();
  planned.forEach((p) => {
    neededCountries.add(p.originCountry);
    neededCountries.add(p.destinationCountry);
  });

  await ensureWarehouses(token, neededCountries);

  console.log('Creating 30 slots...');
  let ok = 0;
  for (const p of planned) {
    try {
      const id = await createShipment(token, p.payload);
      ok++;
      console.log(
        `  ${ok}/30 ${p.originCountry} (${(p.payload as any).originCity}) -> ${p.destinationCountry} (${(p.payload as any).destinationCity}) | ${p.dep.toISOString().slice(0, 10)} | ${p.corridor} | £${p.pricePerKg}/kg | cap ${p.totalCapacityKg}kg | id ${id}`
      );
    } catch (e) {
      console.error('  Failed creating slot:', p.originCountry, '->', p.destinationCountry, p.dep.toISOString().slice(0, 10));
      throw e;
    }
  }
  console.log('Done. Created', ok, 'slots.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

