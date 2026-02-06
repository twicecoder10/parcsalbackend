/**
 * Create 40 realistic SHIP shipment slots for a company.
 *
 * Rules:
 * - Routes ONLY between: Africa <-> Europe, and USA <-> Africa
 * - Supported countries:
 *   Europe: UK, Ireland, France, Spain, Italy, Germany, Netherlands, Belgium, Switzerland
 *   Americas: USA
 *   Africa: Senegal, Mali, Guinea, Togo, Burkina Faso, Congo, DRC (Democratic Republic of the Congo),
 *           South Africa, Zimbabwe, Tanzania, Morocco, Algeria, Benin, Cameroon, Ghana,
 *           Ivory Coast, Nigeria
 * - MODE: SHIP only
 * - Price models: PER_KG, PER_ITEM, FLAT (mix)
 * - Times: realistic sea transit times
 * - Each slot must have a unique departure DATE within next 1–6 months
 * - Realistic capacities, cutoffs, and notes
 *
 * Run:
 *   npx ts-node scripts/create-40-slots-ship-mixed-pricing-africa-europe-usa.ts
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
  // Europe hubs (ports / major cities)
  UK: ['London', 'Felixstowe', 'Liverpool'],
  Ireland: ['Dublin'],
  France: ['Le Havre', 'Marseille', 'Paris'],
  Spain: ['Valencia', 'Barcelona', 'Madrid'],
  Italy: ['Genoa', 'Naples', 'Milan'],
  Germany: ['Hamburg', 'Bremen', 'Frankfurt'],
  Netherlands: ['Rotterdam', 'Amsterdam'],
  Belgium: ['Antwerp', 'Brussels'],
  Switzerland: ['Zurich', 'Basel'],
  // USA hubs
  USA: ['New York', 'Baltimore', 'Houston'],
  // Africa hubs
  Senegal: ['Dakar'],
  Mali: ['Bamako'],
  Guinea: ['Conakry'],
  Togo: ['Lomé'],
  'Burkina Faso': ['Ouagadougou'],
  Congo: ['Pointe-Noire', 'Brazzaville'],
  'DRC (Democratic Republic of the Congo)': ['Kinshasa'],
  'South Africa': ['Durban', 'Cape Town', 'Johannesburg'],
  Zimbabwe: ['Harare'],
  Tanzania: ['Dar es Salaam'],
  Morocco: ['Casablanca', 'Tangier'],
  Algeria: ['Algiers'],
  Benin: ['Cotonou'],
  Cameroon: ['Douala', 'Yaoundé'],
  Ghana: ['Tema', 'Accra'],
  'Ivory Coast': ['Abidjan'],
  Nigeria: ['Lagos', 'Port Harcourt'],
};

type CorridorType = 'EUROPE_AFRICA' | 'USA_AFRICA';
type PricingModel = 'PER_KG' | 'PER_ITEM' | 'FLAT';

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

function addHours(d: Date, hours: number): Date {
  return new Date(d.getTime() + hours * 3_600_000);
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

function pickCity(country: string): string {
  const cities = COUNTRY_CITIES[country];
  if (!cities?.length) return `${country} City`;
  return randomChoice(cities);
}

function africaRegion(africaCountry: string): 'NORTH' | 'WEST' | 'CENTRAL' | 'SOUTH' | 'EAST' {
  if (africaCountry === 'Morocco' || africaCountry === 'Algeria') return 'NORTH';
  if (africaCountry === 'South Africa' || africaCountry === 'Zimbabwe') return 'SOUTH';
  if (africaCountry === 'Tanzania') return 'EAST';
  if (africaCountry === 'Congo' || africaCountry === 'DRC (Democratic Republic of the Congo)' || africaCountry === 'Cameroon')
    return 'CENTRAL';
  return 'WEST';
}

function seaTransitHours(corridor: CorridorType, africaCountry: string): number {
  const region = africaRegion(africaCountry);

  // Base transit ranges in DAYS (very approximate but realistic enough)
  let minDays: number;
  let maxDays: number;

  if (corridor === 'USA_AFRICA') {
    if (region === 'NORTH') {
      minDays = 12;
      maxDays = 22;
    } else if (region === 'WEST') {
      minDays = 14;
      maxDays = 26;
    } else if (region === 'CENTRAL') {
      minDays = 18;
      maxDays = 30;
    } else if (region === 'EAST') {
      minDays = 25;
      maxDays = 38;
    } else {
      // SOUTH
      minDays = 22;
      maxDays = 40;
    }
  } else {
    // EUROPE_AFRICA
    if (region === 'NORTH') {
      minDays = 4;
      maxDays = 10;
    } else if (region === 'WEST') {
      minDays = 7;
      maxDays = 16;
    } else if (region === 'CENTRAL') {
      minDays = 12;
      maxDays = 22;
    } else if (region === 'EAST') {
      minDays = 18;
      maxDays = 30;
    } else {
      // SOUTH
      minDays = 16;
      maxDays = 28;
    }
  }

  const transitDays = minDays + Math.random() * (maxDays - minDays);
  const portHandlingHours = randomInt(24, 96); // port handling / transshipment buffer
  return Math.round(transitDays * 24) + portHandlingHours;
}

function choosePricingModel(): PricingModel {
  const r = Math.random();
  if (r < 0.5) return 'PER_KG';
  if (r < 0.8) return 'PER_ITEM';
  return 'FLAT';
}

function pricesAndCapacities(corridor: CorridorType, model: PricingModel) {
  // “realistic based on model” — shipping is usually cheaper per kg than air, and flat can be higher.
  if (model === 'PER_KG') {
    const pricePerKg = corridor === 'EUROPE_AFRICA'
      ? round2(2.5 + Math.random() * 4.5) // 2.5–7.0
      : round2(4.5 + Math.random() * 6.5); // 4.5–11.0
    const totalCapacityKg = randomInt(2500, 25000);
    return { pricingModel: model, pricePerKg, totalCapacityKg };
  }

  if (model === 'PER_ITEM') {
    const pricePerItem = corridor === 'EUROPE_AFRICA'
      ? round2(20 + Math.random() * 80) // 20–100
      : round2(35 + Math.random() * 115); // 35–150
    const totalCapacityItems = randomInt(80, 1500);
    return { pricingModel: model, pricePerItem, totalCapacityItems };
  }

  // FLAT
  const flatPrice = corridor === 'EUROPE_AFRICA'
    ? round2(300 + Math.random() * 2200) // 300–2500
    : round2(600 + Math.random() * 4400); // 600–5000
  const totalCapacityKg = randomInt(4000, 30000);
  const totalCapacityItems = randomInt(120, 2000);
  return { pricingModel: model, flatPrice, totalCapacityKg, totalCapacityItems };
}

function buildNotes(originCountry: string, destinationCountry: string, model: PricingModel): string {
  const notes = [
    'Ocean freight only. No hazardous goods, batteries, liquids, or perishables.',
    'Shipper must provide invoice and packing list. Customs clearance times may vary.',
    'Free storage up to 48 hours at origin warehouse; demurrage/storage fees may apply after.',
    'Cutoff strictly enforced to meet vessel/feeder schedules.',
    'Cargo must be palletized or in strong cartons; fragile items require extra packaging.',
  ];

  const modelLine =
    model === 'PER_KG'
      ? 'Pricing is per kilogram. Oversize cargo may be charged by volumetric weight.'
      : model === 'PER_ITEM'
        ? 'Pricing is per item/parcel. Consolidation available on request.'
        : 'Flat-rate slot. Best for consolidated shipments; extra handling may apply for oversized cargo.';

  return `Route: ${originCountry} → ${destinationCountry}. ${modelLine} ${randomChoice(notes)}`;
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

type Warehouse = { id: string; country: string; city: string; name: string };

async function listWarehouses(token: string): Promise<Warehouse[]> {
  const res = await fetch(`${BASE_URL}/companies/warehouses`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`List warehouses failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { data?: Warehouse[] };
  return json?.data ?? [];
}

async function createWarehouse(token: string, country: string): Promise<void> {
  const city = pickCity(country);
  const name = `${city} Warehouse`;
  const address = `${city} Cargo/Port Operations Center`;
  const res = await fetch(`${BASE_URL}/companies/warehouses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, address, city, country, postalCode: '', isDefault: false }),
  });
  if (!res.ok) throw new Error(`Create warehouse failed for ${country} (${res.status}): ${await res.text()}`);
}

async function ensureWarehouses(token: string, countriesNeeded: Set<string>): Promise<void> {
  const existing = await listWarehouses(token);
  const existingCountries = new Set(existing.map((w) => w.country));
  const missing = Array.from(countriesNeeded).filter((c) => !existingCountries.has(c));
  for (const c of missing) {
    await createWarehouse(token, c);
  }
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

function pickRoute(): { originCountry: string; destinationCountry: string; corridor: CorridorType; africaCountry: string } {
  // 65% Europe<->Africa, 35% USA<->Africa
  const useUSA = Math.random() < 0.35;
  const africa = randomChoice(AFRICA);
  if (useUSA) {
    const out = Math.random() < 0.5;
    const originCountry = out ? USA : africa;
    const destinationCountry = out ? africa : USA;
    return { originCountry, destinationCountry, corridor: 'USA_AFRICA', africaCountry: africa };
  }
  const europe = randomChoice(EUROPE);
  const out = Math.random() < 0.5;
  const originCountry = out ? europe : africa;
  const destinationCountry = out ? africa : europe;
  return { originCountry, destinationCountry, corridor: 'EUROPE_AFRICA', africaCountry: africa };
}

function pickUniqueDepartureDate(usedDates: Set<string>): Date {
  // Choose a unique date between 30 and 180 days from now (1–6 months)
  let dep: Date;
  while (true) {
    const daysFromNow = randomInt(30, 180);
    dep = addDays(new Date(), daysFromNow);
    dep.setUTCHours(randomInt(6, 19), randomChoice([0, 30]), 0, 0);
    const key = dep.toISOString().slice(0, 10);
    if (!usedDates.has(key)) {
      usedDates.add(key);
      return dep;
    }
  }
}

async function main() {
  console.log('API base URL:', BASE_URL);
  const token = await login();

  const usedDates = await listAllDepartureDates(token);

  const planned: Array<{ payload: Record<string, unknown>; summary: string }> = [];
  const neededCountries = new Set<string>();

  for (let i = 0; i < 40; i++) {
    const { originCountry, destinationCountry, corridor, africaCountry } = pickRoute();
    const originCity = pickCity(originCountry);
    const destinationCity = pickCity(destinationCountry);

    const dep = pickUniqueDepartureDate(usedDates);
    const transitH = seaTransitHours(corridor, africaCountry);
    const arr = addHours(dep, transitH);

    // Cutoff: 2–7 days before departure (ship needs earlier cutoff)
    const cutoff = addMinutes(dep, -randomInt(48, 168) * 60);

    const model = choosePricingModel();
    const pricing = pricesAndCapacities(corridor, model);

    neededCountries.add(originCountry);
    neededCountries.add(destinationCountry);

    const payload: Record<string, unknown> = {
      originCountry,
      originCity,
      destinationCountry,
      destinationCity,
      departureTime: dep.toISOString(),
      arrivalTime: arr.toISOString(),
      mode: 'SHIP',
      pricingModel: pricing.pricingModel,
      cutoffTimeForReceivingItems: cutoff.toISOString(),
      status: 'PUBLISHED',
      bookingNotes: buildNotes(originCountry, destinationCountry, model),
      allowsPickupFromSender: true,
      allowsDropOffAtCompany: true,
      allowsDeliveredToReceiver: true,
      allowsReceiverPicksUp: true,
    };

    if ('totalCapacityKg' in pricing) payload.totalCapacityKg = (pricing as any).totalCapacityKg;
    if ('totalCapacityItems' in pricing) payload.totalCapacityItems = (pricing as any).totalCapacityItems;
    if ('pricePerKg' in pricing) payload.pricePerKg = (pricing as any).pricePerKg;
    if ('pricePerItem' in pricing) payload.pricePerItem = (pricing as any).pricePerItem;
    if ('flatPrice' in pricing) payload.flatPrice = (pricing as any).flatPrice;

    const dateKey = dep.toISOString().slice(0, 10);
    const summary = `${dateKey} ${originCountry} (${originCity}) -> ${destinationCountry} (${destinationCity}) | ${corridor} | ${model}`;
    planned.push({ payload, summary });
  }

  await ensureWarehouses(token, neededCountries);

  console.log('Creating 40 SHIP slots...');
  let created = 0;
  for (const p of planned) {
    const id = await createShipment(token, p.payload);
    created++;
    console.log(`  ${created}/40 ${p.summary} | id ${id}`);
  }
  console.log('Done. Created', created, 'slots.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

