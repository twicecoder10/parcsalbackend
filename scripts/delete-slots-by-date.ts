/**
 * Delete all shipment slots created on specific dates (e.g. 05 Feb 2026 and 06 Feb 2026).
 * Uses company login, lists slots, filters by createdAt date, then deletes each.
 *
 * Run: npx ts-node scripts/delete-slots-by-date.ts
 * Optional: DELETE_SLOT_DATES=2026-02-05,2026-02-06 (comma-separated YYYY-MM-DD)
 */

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const EMAIL = process.env.COMPANY_EMAIL || 'hazeem4877@gmail.com';
const PASSWORD = process.env.COMPANY_PASSWORD || 'Password123';

const DATES_TO_DELETE =
  process.env.DELETE_SLOT_DATES?.split(',').map((d) => d.trim()) || ['2026-02-05', '2026-02-06'];

function isDateInSet(isoDateStr: string, dateSet: string[]): boolean {
  const datePart = isoDateStr.slice(0, 10);
  return dateSet.includes(datePart);
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
  if (json?.data?.user?.role !== 'COMPANY_ADMIN' || !json?.data?.user?.companyId) {
    throw new Error('User is not a company admin');
  }
  return token;
}

async function fetchAllCompanyShipments(token: string): Promise<Array<{ id: string; createdAt: string; originCity: string; destinationCity: string }>> {
  const all: Array<{ id: string; createdAt: string; originCity: string; destinationCity: string }> = [];
  const limit = 100;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const res = await fetch(`${BASE_URL}/companies/shipments?limit=${limit}&offset=${offset}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`List shipments failed (${res.status}): ${text}`);
    }
    const json = (await res.json()) as {
      data?: Array<{ id: string; createdAt: string; originCity: string; destinationCity: string }>;
      pagination?: { total: number; hasMore: boolean };
    };
    const data = json?.data ?? [];
    const pagination = json?.pagination;
    data.forEach((s) => all.push(s));
    if (!data.length || (pagination && !pagination.hasMore)) {
      hasMore = false;
    } else {
      offset += limit;
      if (data.length < limit) hasMore = false;
    }
  }
  return all;
}

async function deleteSlot(token: string, id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/companies/shipments/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Delete slot ${id} failed (${res.status}): ${text}`);
  }
}

async function main() {
  console.log('API base URL:', BASE_URL);
  console.log('Delete slots created on:', DATES_TO_DELETE.join(', '));
  const token = await login();

  const shipments = await fetchAllCompanyShipments(token);
  const toDelete = shipments.filter((s) => isDateInSet(s.createdAt, DATES_TO_DELETE));
  console.log('Total company slots:', shipments.length);
  console.log('Slots created on target dates:', toDelete.length);

  if (toDelete.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  for (const s of toDelete) {
    await deleteSlot(token, s.id);
    console.log('  Deleted:', s.id, '|', s.originCity, '->', s.destinationCity, '|', s.createdAt.slice(0, 10));
  }
  console.log('Done. Deleted', toDelete.length, 'slot(s).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
