/**
 * Test shipment search ranking with real DB data.
 * Calls shipmentRepository.search() and prints order + each company's subscription plan.
 * Uses subscription data for ALL companies with published shipments so labels are correct.
 *
 * Run: npx ts-node scripts/test-shipment-ranking-db.ts
 * Requires: .env with DATABASE_URL (or dotenv loaded by your shell).
 */

import 'dotenv/config';
import prisma from '../src/config/database';
import { shipmentRepository } from '../src/modules/shipments/repository';
import { SubscriptionStatus } from '@prisma/client';

async function main() {
  const now = new Date();

  // 1) Get ALL companies that have at least one published shipment (verified)
  const companiesWithSlots = await prisma.shipmentSlot.findMany({
    where: {
      status: 'PUBLISHED',
      company: { isVerified: true },
      departureTime: { gte: now },
    },
    select: { companyId: true },
    distinct: ['companyId'],
  });
  const allCompanyIds = companiesWithSlots.map((c) => c.companyId);

  if (allCompanyIds.length === 0) {
    console.log('No published shipments from verified companies.');
    await prisma.$disconnect();
    return;
  }

  // 2) Fetch active subscription (current period) and name for each of those companies
  const [activeSubs, companies] = await Promise.all([
    prisma.subscription.findMany({
      where: {
        companyId: { in: allCompanyIds },
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: { lte: now },
        currentPeriodEnd: { gte: now },
      },
      select: {
        companyId: true,
        companyPlan: {
          select: {
            carrierPlan: true,
            name: true,
          },
        },
      },
    }),
    prisma.company.findMany({
      where: { id: { in: allCompanyIds } },
      select: { id: true, name: true },
    }),
  ]);

  const planByCompany = new Map<string, string>();
  for (const sub of activeSubs) {
    const plan = sub.companyPlan.carrierPlan ?? sub.companyPlan.name ?? '—';
    planByCompany.set(sub.companyId, plan);
  }
  const nameByCompany = new Map(companies.map((c) => [c.id, c.name]));

  // Summary: plan per company (so we can confirm "not both are Professional")
  console.log('Companies with published shipments and their subscription plan (active in current period):');
  for (const c of companies) {
    const plan = planByCompany.get(c.id) ?? 'no active sub';
    console.log('  -', c.name, '→', plan);
  }
  console.log('');

  // 3) Run actual search (same as public API) and show enough results to see both companies
  const limit = Math.min(60, 30 + allCompanyIds.length * 15);
  const { shipments, total } = await shipmentRepository.search({}, { limit, offset: 0 });

  console.log(`Public search result (ranked): total=${total}, showing first ${shipments.length}`);
  console.log('Rank | Shipment ID (short) | Company name           | Plan        | Departure (UTC)');
  console.log('-'.repeat(90));

  shipments.forEach((s, i) => {
    const rank = i + 1;
    const shortId = s.id.slice(0, 8) + '…';
    const companyName = (nameByCompany.get(s.companyId) ?? '—').slice(0, 22).padEnd(22);
    const plan = (planByCompany.get(s.companyId) ?? 'no active sub').padEnd(11);
    const dep = s.departureTime.toISOString().slice(0, 16).replace('T', ' ');
    console.log(`${String(rank).padStart(4)} | ${shortId.padEnd(20)} | ${companyName} | ${plan} | ${dep}`);
  });

  console.log('\nExpected: higher plan (ENTERPRISE > PROFESSIONAL > STARTER > FREE) first, then soonest departure.');
  console.log('Companies with no active subscription in current period appear as "no active sub".');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
