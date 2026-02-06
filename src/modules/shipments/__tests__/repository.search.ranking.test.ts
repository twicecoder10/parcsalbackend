import prisma from '../../../config/database';
import { shipmentRepository } from '../repository';

jest.mock('../../../config/database', () => {
  const mockPrisma = {
    shipmentSlot: {
      findMany: jest.fn(),
    },
    subscription: {
      findMany: jest.fn(),
    },
  };
  return { __esModule: true, default: mockPrisma };
});

describe('shipmentRepository.search - subscription ranking', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-06T12:00:00.000Z'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('prioritizes higher subscription tier over departureTime', async () => {
    const now = new Date();

    // Base query returns shipments already filtered by DB; ranking happens in-memory.
    (prisma.shipmentSlot.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'ship-starter-late',
        companyId: 'co-starter',
        departureTime: new Date(now.getTime() + 1 * 60 * 60 * 1000), // +1h
        createdAt: new Date(now.getTime() - 1 * 60 * 60 * 1000),
        pricingModel: 'FLAT',
        flatPrice: null,
        pricePerKg: null,
        pricePerItem: null,
      },
      {
        id: 'ship-enterprise-early',
        companyId: 'co-enterprise',
        departureTime: new Date(now.getTime() + 10 * 60 * 1000), // +10m
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        pricingModel: 'FLAT',
        flatPrice: null,
        pricePerKg: null,
        pricePerItem: null,
      },
      {
        id: 'ship-no-sub-earliest',
        companyId: 'co-none',
        departureTime: new Date(now.getTime() + 1 * 60 * 1000), // +1m
        createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
        pricingModel: 'FLAT',
        flatPrice: null,
        pricePerKg: null,
        pricePerItem: null,
      },
    ]);

    (prisma.subscription.findMany as jest.Mock).mockResolvedValue([
      {
        companyId: 'co-enterprise',
        companyPlan: { carrierPlan: 'ENTERPRISE', name: 'ENTERPRISE' },
      },
      {
        companyId: 'co-starter',
        companyPlan: { carrierPlan: 'STARTER', name: 'STARTER' },
      },
      // co-none intentionally has no subscription
    ]);

    const result = await shipmentRepository.search({}, { limit: 50, offset: 0 });

    expect(result.total).toBe(3);
    expect(result.shipments.map((s: any) => s.id)).toEqual([
      'ship-enterprise-early', // enterprise first (even though not earliest overall)
      'ship-starter-late',
      'ship-no-sub-earliest', // no subscription last
    ]);
  });

  it('for same tier, sorts by departureTime asc then createdAt desc', async () => {
    const now = new Date();

    (prisma.shipmentSlot.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'ship-pro-late-created-old',
        companyId: 'co-pro',
        departureTime: new Date(now.getTime() + 60 * 60 * 1000), // +1h
        createdAt: new Date(now.getTime() - 10 * 60 * 1000), // older
        pricingModel: 'FLAT',
        flatPrice: null,
        pricePerKg: null,
        pricePerItem: null,
      },
      {
        id: 'ship-pro-early',
        companyId: 'co-pro',
        departureTime: new Date(now.getTime() + 30 * 60 * 1000), // +30m
        createdAt: new Date(now.getTime() - 5 * 60 * 1000),
        pricingModel: 'FLAT',
        flatPrice: null,
        pricePerKg: null,
        pricePerItem: null,
      },
      {
        id: 'ship-pro-late-created-new',
        companyId: 'co-pro',
        departureTime: new Date(now.getTime() + 60 * 60 * 1000), // +1h (same as first)
        createdAt: new Date(now.getTime() - 1 * 60 * 1000), // newer
        pricingModel: 'FLAT',
        flatPrice: null,
        pricePerKg: null,
        pricePerItem: null,
      },
    ]);

    (prisma.subscription.findMany as jest.Mock).mockResolvedValue([
      {
        companyId: 'co-pro',
        companyPlan: { carrierPlan: 'PROFESSIONAL', name: 'PROFESSIONAL' },
      },
    ]);

    const result = await shipmentRepository.search({}, { limit: 50, offset: 0 });

    expect(result.shipments.map((s: any) => s.id)).toEqual([
      'ship-pro-early',
      'ship-pro-late-created-new',
      'ship-pro-late-created-old',
    ]);
  });
});

