/**
 * Delete shipment slots created on specific dates (e.g. 05 and 06 Feb 2026).
 * Uses Prisma directly so PUBLISHED slots can be removed (API only allows deleting DRAFT).
 *
 * Run: npx ts-node scripts/delete-slots-by-date-db.ts
 * Optional: DELETE_SLOT_DATES=2026-02-05,2026-02-06
 * Optional: COMPANY_EMAIL=hazeem4877@gmail.com (company admin email to identify company)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COMPANY_EMAIL = process.env.COMPANY_EMAIL || 'hazeem4877@gmail.com';
const DATES_TO_DELETE =
  process.env.DELETE_SLOT_DATES?.split(',').map((d) => d.trim()) || ['2026-02-05', '2026-02-06'];

async function main() {
  const company = await prisma.company.findFirst({
    where: {
      admin: {
        email: COMPANY_EMAIL,
        role: 'COMPANY_ADMIN',
      },
    },
    select: { id: true, name: true },
  });

  if (!company) {
    throw new Error(`Company not found for admin email: ${COMPANY_EMAIL}`);
  }
  console.log('Company:', company.name, '|', company.id);

  const start0 = new Date(DATES_TO_DELETE[0] + 'T00:00:00.000Z');
  const end0 = new Date(DATES_TO_DELETE[0] + 'T23:59:59.999Z');
  const start1 = new Date(DATES_TO_DELETE[1] + 'T00:00:00.000Z');
  const end1 = new Date(DATES_TO_DELETE[1] + 'T23:59:59.999Z');

  const toDelete = await prisma.shipmentSlot.findMany({
    where: {
      companyId: company.id,
      OR: [
        { createdAt: { gte: start0, lte: end0 } },
        { createdAt: { gte: start1, lte: end1 } },
      ],
    },
    select: { id: true, originCity: true, destinationCity: true, createdAt: true, status: true },
  });

  console.log('Slots to delete (created on', DATES_TO_DELETE.join(' or '), '):', toDelete.length);
  if (toDelete.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  const ids = toDelete.map((s) => s.id);
  const result = await prisma.shipmentSlot.deleteMany({
    where: { id: { in: ids } },
  });

  toDelete.forEach((s) =>
    console.log('  Deleted:', s.id, '|', s.originCity, '->', s.destinationCity, '|', s.createdAt.toISOString().slice(0, 10))
  );
  console.log('Done. Deleted', result.count, 'slot(s).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
