/**
 * Create 30 realistic AIR-only PER_KG slots for demo@parcsal.com.
 *
 * Rules:
 * - Routes ONLY: Africa <-> Europe, and North America (United States of America) <-> Africa
 * - Supported countries (use these strings EXACTLY):
 *   Europe: United Kingdom, Ireland, France, Spain, Italy, Germany, Netherlands, Belgium, Switzerland
 *   North America: United States of America
 *   Africa: Senegal, Mali, Guinea, Togo, Burkina Faso, Democratic Republic of the Congo,
 *           Republic of the Congo, South Africa, Zimbabwe, United Republic of Tanzania,
 *           Morocco, Algeria, Benin, Cameroon, Ghana, Cote d'Ivoire, Nigeria
 * - MODE: AIR only
 * - PricingModel: PER_KG only
 * - Prices:
 *   - Europe/Africa: 9–15
 *   - North America/Africa: 14–20
 * - Times: realistic flight times
 * - Unique departure DATE (YYYY-MM-DD) for each slot; within next 1–6 months
 * - Realistic capacities, cutoff times, and notes
 *
 * Run:
 *   npx ts-node scripts/create-30-slots-demo-air-perkg-africa-europe-usa.ts
 *
 * Env overrides:
 *   API_BASE_URL=http://localhost:4000
 *   COMPANY_EMAIL=demo@parcsal.com
 *   COMPANY_PASSWORD=Demo12345
 */

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const EMAIL = process.env.COMPANY_EMAIL || 'demo@parcsal.com';
const PASSWORD = process.env.COMPANY_PASSWORD || 'Demo12345';

const EUROPE = [
  'United Kingdom',
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
  'Democratic Republic of the Congo',
  'Republic of the Congo',
  'South Africa',
  'Zimbabwe',
  'United Republic of Tanzania',
  'Morocco',
  'Algeria',
  'Benin',
  'Cameroon',
  'Ghana',
  'Cote d\'Ivoire',
  'Nigeria',
] as const;

const USA = 'United States of America' as const;

const COUNTRY_CITIES: Record<string, string[]> = {
  // Europe
  'United Kingdom': ['London', 'Manchester'],
  Ireland: ['Dublin'],
  France: ['Paris', 'Lyon'],
  Spain: ['Madrid', 'Barcelona'],
  Italy: ['Rome', 'Milan'],
  Germany: ['Frankfurt', 'Berlin'],
  Netherlands: ['Amsterdam', 'Rotterdam'],
  Belgium: ['Brussels'],
  Switzerland: ['Zurich', 'Geneva'],
  // North America
  'United States of America': ['New York', 'Atlanta', 'Washington DC'],
  // Africa
  Senegal: ['Dakar'],
  Mali: ['Bamako'],
  Guinea: ['Conakry'],
  Togo: ['Lomé'],
  'Burkina Faso': ['Ouagadougou'],
  'Democratic Republic of the Congo': ['Kinshasa'],
  'Republic of the Congo': ['Brazzaville', 'Pointe-Noire'],
  'South Africa': ['Johannesburg', 'Cape Town'],
  Zimbabwe: ['Harare'],
  'United Republic of Tanzania': ['Dar es Salaam'],
  Morocco: ['Casablanca', 'Marrakesh'],
  Algeria: ['Algiers'],
  Benin: ['Cotonou'],
  Cameroon: ['Douala', 'Yaoundé'],
  Ghana: ['Accra'],
  'Cote d\'Ivoire': ['Abidjan'],
  Nigeria: ['Lagos', 'Abuja'],
};

type CorridorType = 'EUROPE_AFRICA' | 'USA_AFRICA';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: readonly T[] | T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function addDaysUTC(d: Date, days: number): Date {
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

function isAfrica(country: string): boolean {
  return (AFRICA as readonly string[]).includes(country);
}

function isEurope(country: string): boolean {
  return (EUROPE as readonly string[]).includes(country);
}

function corridorType(originCountry: string, destinationCountry: string): CorridorType {
  if ((isAfrica(originCountry) && isEurope(destinationCountry)) || (isEurope(originCountry) && isAfrica(destinationCountry))) {
    return 'EUROPE_AFRICA';
  }
  if ((originCountry === USA && isAfrica(destinationCountry)) || (destinationCountry === USA && isAfrica(originCountry))) {
    return 'USA_AFRICA';
  }
  throw new Error(`Invalid corridor: ${originCountry} -> ${destinationCountry}`);
}

function pricePerKgFor(corridor: CorridorType): number {
  if (corridor === 'EUROPE_AFRICA') return round2(9 + Math.random() * 6); // 9–15
  return round2(14 + Math.random() * 6); // 14–20
}

function africaRegion(africaCountry: string): 'NORTH' | 'WEST' | 'CENTRAL' | 'SOUTH' | 'EAST' {
  if (africaCountry === 'Morocco' || africaCountry === 'Algeria') return 'NORTH';
  if (africaCountry === 'South Africa' || africaCountry === 'Zimbabwe') return 'SOUTH';
  if (africaCountry === 'United Republic of Tanzania') return 'EAST';
  if (africaCountry === 'Cameroon' || africaCountry === 'Republic of the Congo' || africaCountry === 'Democratic Republic of the Congo') return 'CENTRAL';
  return 'WEST';
}

function flightDurationMinutes(corridor: CorridorType, africaCountry: string): number {
  const region = africaRegion(africaCountry);

  // Approximate block times (includes some buffer)
  let minH: number;
  let maxH: number;

  if (corridor === 'USA_AFRICA') {
    if (region === 'NORTH') {
      minH = 7.5; maxH = 10.5;
    } else if (region === 'WEST') {
      minH = 8.0; maxH = 11.5;
    } else if (region === 'CENTRAL') {
      minH = 10.0; maxH = 13.5;
    } else if (region === 'EAST') {
      minH = 13.0; maxH = 17.5;
    } else {
      minH = 14.0; maxH = 18.5; // SOUTH
    }
  } else {
    // EUROPE_AFRICA
    if (region === 'NORTH') {
      minH = 2.5; maxH = 4.5;
    } else if (region === 'WEST') {
      minH = 4.5; maxH = 7.5;
    } else if (region === 'CENTRAL') {
      minH = 6.0; maxH = 8.5;
    } else if (region === 'EAST') {
      minH = 8.5; maxH = 11.5;
    } else {
      minH = 9.5; maxH = 12.5; // SOUTH
    }
  }

  const flightMin = Math.round(minH * 60 + Math.random() * ((maxH - minH) * 60));
  const taxiAndOps = randomInt(25, 55);
  return flightMin + taxiAndOps;
}

function pickCity(country: string): string {
  const cities = COUNTRY_CITIES[country];
  if (!cities?.length) throw new Error(`No cities configured for ${country}`);
  return randomChoice(cities);
}

function buildNotes(originCountry: string, destinationCountry: string, corridor: CorridorType): string {
  const options = [
    'No hazardous materials, batteries, liquids, or perishables. Proper packaging required.',
    'Customs paperwork required (invoice + packing list). Screening may apply.',
    'Drop-off strictly before cutoff to meet cargo acceptance and security checks.',
    'Max single piece weight 30kg unless pre-approved. Oversize handling may incur fees.',
    'Fragile items must be packed securely; insurance recommended for high-value goods.',
  ];
  const corridorLine =
    corridor === 'USA_AFRICA'
      ? 'USA ↔ Africa lane: allow extra time for customs and screening.'
      : 'Europe ↔ Africa lane: customs checks apply at both ends.';
  return `Route: ${originCountry} → ${destinationCountry}. ${corridorLine} ${randomChoice(options)}`;
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
  const role = json?.data?.user?.role;
  const companyId = json?.data?.user?.companyId;
  if (role !== 'COMPANY_ADMIN' || !companyId) {
    throw new Error(`User is not a company admin or has no company. role=${role}, companyId=${companyId}`);
  }
  console.log('Logged in. companyId:', companyId);
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
  // 70% Europe<->Africa, 30% USA<->Africa
  const useUSA = Math.random() < 0.3;
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
  while (true) {
    const daysFromNow = randomInt(30, 180);
    const dep = addDaysUTC(new Date(), daysFromNow);
    dep.setUTCHours(randomInt(6, 21), randomChoice([0, 30]), 0, 0);
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

  console.log('Creating 30 AIR slots...');
  for (let i = 0; i < 30; i++) {
    const { originCountry, destinationCountry, corridor, africaCountry } = pickRoute();
    const originCity = pickCity(originCountry);
    const destinationCity = pickCity(destinationCountry);

    const dep = pickUniqueDepartureDate(usedDates);
    const durationMin = flightDurationMinutes(corridor, africaCountry);
    const arr = addMinutes(dep, durationMin);

    const cutoffHours = randomInt(24, 72);
    const cutoff = addMinutes(dep, -cutoffHours * 60);

    const pricePerKg = pricePerKgFor(corridor);
    const totalCapacityKg = randomInt(180, 1200);

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
      bookingNotes: buildNotes(originCountry, destinationCountry, corridor),
      allowsPickupFromSender: true,
      allowsDropOffAtCompany: true,
      allowsDeliveredToReceiver: true,
      allowsReceiverPicksUp: true,
    };

    const id = await createShipment(token, payload);
    console.log(
      `  ${i + 1}/30 ${originCountry} (${originCity}) -> ${destinationCountry} (${destinationCity}) | ${dep.toISOString().slice(0, 10)} | ${corridor} | £${pricePerKg}/kg | id ${id}`
    );
  }
  console.log('Done. Created 30 slots.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

