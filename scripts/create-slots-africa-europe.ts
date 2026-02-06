/**
 * Script: Login as company (hazeem4877@gmail.com) and create 25 realistic shipment slots
 * targeting Africa & West Europe (UK, Ivory Coast, Nigeria, Ghana, France, Spain,
 * Netherlands, Benin, Cameroon, Germany) within the next 3–6 months.
 *
 * Run: npx ts-node scripts/create-slots-africa-europe.ts
 * Ensure BACKEND is running (e.g. npm run dev) and BASE_URL points to it.
 */

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const EMAIL = 'hazeem4877@gmail.com';
const PASSWORD = 'Password123';

const COUNTRIES_CITIES: Record<string, string[]> = {
  UK: ['London', 'Manchester', 'Birmingham'],
  'IVORY COAST': ['Abidjan'],
  NIGERIA: ['Lagos', 'Abuja', 'Port Harcourt'],
  GHANA: ['Accra', 'Kumasi'],
  FRANCE: ['Paris', 'Lyon', 'Marseille'],
  SPAIN: ['Madrid', 'Barcelona', 'Valencia'],
  NETHERLANDS: ['Amsterdam', 'Rotterdam'],
  BENIN: ['Cotonou', 'Porto-Novo'],
  CAMEROON: ['Douala', 'Yaoundé'],
  GERMANY: ['Berlin', 'Frankfurt', 'Hamburg', 'Munich'],
};

const MODES = ['AIR', 'SHIP', 'VAN', 'BUS'] as const;
const PRICING_MODELS = ['PER_KG', 'FLAT', 'PER_ITEM'] as const;

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function addHours(d: Date, h: number): Date {
  const out = new Date(d);
  out.setHours(out.getHours() + h);
  return out;
}

function toISO(d: Date): string {
  return d.toISOString();
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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
  console.log('Logged in as company admin, companyId:', companyId);
  return token;
}

function buildSlotPayload(index: number): Record<string, unknown> {
  const countries = Object.keys(COUNTRIES_CITIES);
  let originCountry = randomChoice(countries);
  let destinationCountry = randomChoice(countries);
  while (destinationCountry === originCountry) {
    destinationCountry = randomChoice(countries);
  }
  const originCity = randomChoice(COUNTRIES_CITIES[originCountry]);
  const destinationCity = randomChoice(COUNTRIES_CITIES[destinationCountry]);

  // Spread slots over 3–6 months from today (e.g. May–Aug 2026)
  const daysFromNow = 90 + Math.floor((index / 25) * 90);
  const start = addDays(new Date(), daysFromNow);
  const departureTime = new Date(start);
  departureTime.setHours(8 + (index % 12), 0, 0, 0);
  const travelDays = originCountry !== destinationCountry ? (index % 3) + 1 : 1;
  const arrivalTime = addDays(addHours(departureTime, 2), travelDays);
  const cutoffTime = addHours(departureTime, -24);

  const mode = randomChoice([...MODES]);
  const pricingModel = randomChoice([...PRICING_MODELS]);

  const totalCapacityKg = mode === 'AIR' ? 500 : mode === 'SHIP' ? 5000 : 1000;
  const totalCapacityItems = 50 + randomInt(0, 100);

  let pricePerKg: number | null = null;
  let pricePerItem: number | null = null;
  let flatPrice: number | null = null;
  if (pricingModel === 'PER_KG') {
    pricePerKg = 2 + Math.random() * 3;
  } else if (pricingModel === 'PER_ITEM') {
    pricePerItem = 10 + randomInt(0, 25);
  } else {
    flatPrice = 40 + randomInt(0, 120);
  }

  return {
    originCountry,
    originCity,
    destinationCountry,
    destinationCity,
    departureTime: toISO(departureTime),
    arrivalTime: toISO(arrivalTime),
    mode,
    totalCapacityKg,
    totalCapacityItems,
    pricingModel,
    pricePerKg: pricePerKg ?? undefined,
    pricePerItem: pricePerItem ?? undefined,
    flatPrice: flatPrice ?? undefined,
    cutoffTimeForReceivingItems: toISO(cutoffTime),
    status: 'PUBLISHED',
    bookingNotes:
      index % 3 === 0
        ? 'No hazardous goods. Extra charge for pickup outside city centre.'
        : undefined,
    allowsPickupFromSender: true,
    allowsDropOffAtCompany: true,
    allowsDeliveredToReceiver: true,
    allowsReceiverPicksUp: true,
  };
}

async function createSlot(token: string, payload: Record<string, unknown>): Promise<{ id: string; origin: string; dest: string }> {
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
    throw new Error(`Create slot failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { data?: { id?: string } };
  const slot = json?.data;
  if (!slot?.id) throw new Error('No slot id in response');
  return {
    id: slot.id,
    origin: `${payload.originCity}, ${payload.originCountry}`,
    dest: `${payload.destinationCity}, ${payload.destinationCountry}`,
  };
}

async function main() {
  console.log('API base URL:', BASE_URL);
  const token = await login();
  const count = 25;
  console.log(`Creating ${count} slots...`);
  const results: { id: string; origin: string; dest: string }[] = [];
  for (let i = 0; i < count; i++) {
    const payload = buildSlotPayload(i);
    const created = await createSlot(token, payload);
    results.push(created);
    console.log(`  ${i + 1}/${count} ${created.origin} → ${created.dest} (${payload.mode})`);
  }
  console.log(`\nDone. Created ${results.length} slots.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
