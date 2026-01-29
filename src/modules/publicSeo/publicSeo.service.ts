import prisma from '../../config/database';
import { NotFoundError } from '../../utils/errors';

const DEFAULT_LIMIT = 5000;
const MAX_LIMIT = 50000;

function parseLimit(rawLimit: unknown): number {
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function parseCursor(rawCursor: unknown): string | undefined {
  if (typeof rawCursor !== 'string') {
    return undefined;
  }
  const trimmed = rawCursor.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export const publicSeoService = {
  async getSitemapShipments(query: Record<string, unknown>) {
    const limit = parseLimit(query.limit);
    const cursor = parseCursor(query.cursor);
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const shipments = await prisma.shipmentSlot.findMany({
      where: {
        status: 'PUBLISHED',
        departureTime: {
          gte: cutoffDate,
        },
      },
      take: limit,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: [
        { updatedAt: 'desc' },
        { id: 'desc' },
      ],
      select: {
        id: true,
        updatedAt: true,
        departureTime: true,
        arrivalTime: true,
        originCity: true,
        originCountry: true,
        destinationCity: true,
        destinationCountry: true,
      },
    });

    const nextCursor = shipments.length === limit ? shipments[shipments.length - 1].id : undefined;

    return {
      data: shipments,
      nextCursor,
    };
  },

  async getPublicShipmentById(id: string) {
    const shipment = await prisma.shipmentSlot.findFirst({
      where: {
        id,
        status: 'PUBLISHED',
      },
      select: {
        id: true,
        originCity: true,
        originCountry: true,
        destinationCity: true,
        destinationCountry: true,
        departureTime: true,
        arrivalTime: true,
        mode: true,
        pricingModel: true,
        pricePerKg: true,
        pricePerItem: true,
        flatPrice: true,
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!shipment) {
      throw new NotFoundError('Shipment not found');
    }

    const ratingAggregate = await prisma.review.aggregate({
      where: {
        companyId: shipment.company.id,
      },
      _avg: {
        rating: true,
      },
    });

    const rating =
      ratingAggregate._avg.rating !== null
        ? Number(Number(ratingAggregate._avg.rating).toFixed(1))
        : null;

    return {
      ...shipment,
      company: {
        ...shipment.company,
        rating,
      },
    };
  },
};

