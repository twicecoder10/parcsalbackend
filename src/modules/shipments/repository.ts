import prisma from '../../config/database';
import {
  CarrierPlan,
  ShipmentSlot,
  ShipmentStatus,
  ShipmentMode,
  PricingModel,
  SlotTrackingStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { PaginationParams } from '../../utils/pagination';

export interface CreateShipmentData {
  companyId: string;
  originCountry: string;
  originCity: string;
  destinationCountry: string;
  destinationCity: string;
  departureTime: Date;
  arrivalTime: Date;
  mode: ShipmentMode;
  totalCapacityKg?: number | null;
  totalCapacityItems?: number | null;
  remainingCapacityKg?: number | null;
  remainingCapacityItems?: number | null;
  pricingModel: PricingModel;
  pricePerKg?: number | null;
  pricePerItem?: number | null;
  flatPrice?: number | null;
  cutoffTimeForReceivingItems: Date;
  status: ShipmentStatus;
  bookingNotes?: string | null;
  allowsPickupFromSender?: boolean;
  allowsDropOffAtCompany?: boolean;
  allowsDeliveredToReceiver?: boolean;
  allowsReceiverPicksUp?: boolean;
}

export interface UpdateShipmentData extends Partial<CreateShipmentData> {
  companyId?: never;
}

export interface SearchFilters {
  originCountry?: string;
  originCity?: string;
  destinationCountry?: string;
  destinationCity?: string;
  mode?: ShipmentMode;
  departureFrom?: Date;
  departureTo?: Date;
  arrivalFrom?: Date;
  arrivalTo?: Date;
  minPrice?: number;
  maxPrice?: number;
}

function carrierPlanWeight(plan: CarrierPlan | null | undefined): number {
  switch (plan) {
    case 'ENTERPRISE':
      return 4;
    case 'PROFESSIONAL':
      return 3;
    case 'STARTER':
      return 2;
    case 'FREE':
      return 1;
    default:
      return 0;
  }
}

export const shipmentRepository = {
  async create(data: CreateShipmentData): Promise<ShipmentSlot> {
    return prisma.shipmentSlot.create({
      data,
      include: {
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
            isVerified: true,
          },
        },
      },
    });
  },

  async findById(id: string): Promise<ShipmentSlot | null> {
    return prisma.shipmentSlot.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
            isVerified: true,
            logoUrl: true,
          },
        },
      },
    });
  },

  async findByCompany(
    companyId: string,
    params: PaginationParams & { status?: ShipmentStatus; mode?: ShipmentMode; search?: string }
  ): Promise<{ shipments: ShipmentSlot[]; total: number }> {
    const where: any = { companyId };
    if (params.status) {
      where.status = params.status;
    }
    if (params.mode) {
      where.mode = params.mode;
    }
    if (params.search) {
      where.OR = [
        {
          id: {
            contains: params.search,
            mode: 'insensitive',
          },
        },
        {
          originCity: {
            contains: params.search,
            mode: 'insensitive',
          },
        },
        {
          destinationCity: {
            contains: params.search,
            mode: 'insensitive',
          },
        },
        {
          originCountry: {
            contains: params.search,
            mode: 'insensitive',
          },
        },
        {
          destinationCountry: {
            contains: params.search,
            mode: 'insensitive',
          },
        },
      ];
    }

    const [shipments, total] = await Promise.all([
      prisma.shipmentSlot.findMany({
        where,
        skip: params.offset,
        take: params.limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              slug: true,
              isVerified: true,
            },
          },
          _count: {
            select: {
              bookings: true,
            },
          },
        },
      }),
      prisma.shipmentSlot.count({ where }),
    ]);

    return { shipments, total };
  },

  async update(id: string, data: UpdateShipmentData): Promise<ShipmentSlot> {
    return prisma.shipmentSlot.update({
      where: { id },
      data,
      include: {
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
            isVerified: true,
          },
        },
      },
    });
  },

  async updateStatus(id: string, status: ShipmentStatus): Promise<ShipmentSlot> {
    return prisma.shipmentSlot.update({
      where: { id },
      data: { status },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
            isVerified: true,
          },
        },
      },
    });
  },

  async updateTrackingStatus(id: string, trackingStatus: SlotTrackingStatus): Promise<ShipmentSlot> {
    return prisma.shipmentSlot.update({
      where: { id },
      data: { trackingStatus },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
            isVerified: true,
          },
        },
      },
    });
  },

  async search(
    filters: SearchFilters,
    params: PaginationParams
  ): Promise<{ shipments: ShipmentSlot[]; total: number }> {
    const now = new Date();
    const where: any = {
      status: 'PUBLISHED', // Only show published shipments
      company: {
        isVerified: true, // Only show shipments from verified companies
      },
    };

    if (filters.originCountry) {
      where.originCountry = {
        equals: filters.originCountry,
        mode: 'insensitive',
      };
    }
    if (filters.originCity) {
      where.originCity = {
        equals: filters.originCity,
        mode: 'insensitive',
      };
    }
    if (filters.destinationCountry) {
      where.destinationCountry = {
        equals: filters.destinationCountry,
        mode: 'insensitive',
      };
    }
    if (filters.destinationCity) {
      where.destinationCity = {
        equals: filters.destinationCity,
        mode: 'insensitive',
      };
    }
    if (filters.mode) {
      where.mode = filters.mode;
    }

    // Always exclude past shipments - only show shipments with departureTime in the future
    // This ensures users only see available/upcoming shipments
    const hasDepartureFilter = filters.departureFrom || filters.departureTo;
    const hasArrivalFilter = filters.arrivalFrom || filters.arrivalTo;
    
    // Always require departureTime >= now to exclude past shipments
    const departureTimeCondition: any = {
      gte: now, // Base requirement: departure must be in the future
    };
    
    // Apply additional date filters if provided
    if (hasDepartureFilter) {
      if (filters.departureFrom && filters.departureFrom > now) {
        departureTimeCondition.gte = filters.departureFrom; // Use provided date if it's later than now
      }
      if (filters.departureTo) {
        departureTimeCondition.lte = filters.departureTo;
      }
    }
    
    // Handle date filtering with OR logic for departure/arrival
    if (hasDepartureFilter && hasArrivalFilter) {
      // OR condition: departure between dates OR arrival between dates
      // But departure must still be >= now (we can't show past shipments)
      const arrivalCondition: any = {};
      if (filters.arrivalFrom) {
        arrivalCondition.gte = filters.arrivalFrom;
      }
      if (filters.arrivalTo) {
        arrivalCondition.lte = filters.arrivalTo;
      }
      
      where.OR = [
        {
          departureTime: departureTimeCondition,
        },
        {
          AND: [
            { departureTime: { gte: now } }, // Still require departure >= now
            { arrivalTime: arrivalCondition },
          ],
        },
      ];
    } else if (hasDepartureFilter) {
      // Only departure filter
      where.departureTime = departureTimeCondition;
    } else if (hasArrivalFilter) {
      // Only arrival filter - still ensure departure is not in the past
      where.departureTime = { gte: now };
      where.arrivalTime = {};
      if (filters.arrivalFrom) {
        where.arrivalTime.gte = filters.arrivalFrom;
      }
      if (filters.arrivalTo) {
        where.arrivalTime.lte = filters.arrivalTo;
      }
    } else {
      // No date filters - just exclude past shipments
      where.departureTime = departureTimeCondition;
    }

    // Get all matching shipments (before price filtering) to calculate total
    // We need to fetch all to apply price filtering, then paginate
    const allShipments = await prisma.shipmentSlot.findMany({
      where,
      orderBy: [{ departureTime: 'asc' }, { createdAt: 'desc' }],
      include: {
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
            isVerified: true,
            logoUrl: true,
          },
        },
      },
    });

    // Filter by price range in memory (could be optimized with raw SQL)
    let filteredShipments = allShipments;
    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      filteredShipments = allShipments.filter((shipment) => {
        let price: number | null = null;

        if (shipment.pricingModel === 'FLAT' && shipment.flatPrice) {
          price = Number(shipment.flatPrice);
        } else if (shipment.pricingModel === 'PER_KG' && shipment.pricePerKg) {
          // Use average weight for estimation, or require weight in search
          price = Number(shipment.pricePerKg);
        } else if (shipment.pricingModel === 'PER_ITEM' && shipment.pricePerItem) {
          price = Number(shipment.pricePerItem);
        }

        if (price === null) return true; // Include if price cannot be determined

        if (filters.minPrice !== undefined && price < filters.minPrice) {
          return false;
        }
        if (filters.maxPrice !== undefined && price > filters.maxPrice) {
          return false;
        }
        return true;
      });
    }

    // Subscription-based ranking for public shipment lists:
    // - Prefer companies with an ACTIVE subscription in the current billing period
    // - Prefer higher subscription tiers (ENTERPRISE > PROFESSIONAL > STARTER > FREE)
    //
    // We intentionally DO NOT include subscription data in the shipment payload.
    // Instead we fetch subscription info separately and sort in-memory (this endpoint already filters in-memory).
    const uniqueCompanyIds = Array.from(new Set(filteredShipments.map((s) => s.companyId)));
    if (uniqueCompanyIds.length > 0) {
      const activeSubs = await prisma.subscription.findMany({
        where: {
          companyId: { in: uniqueCompanyIds },
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
      });

      const companyToPlanWeight = new Map<string, number>();
      for (const sub of activeSubs) {
        // Prefer the explicit enum if present; otherwise fall back to plan name ("FREE"/"STARTER"/...)
        const plan =
          sub.companyPlan.carrierPlan ??
          (Object.values(CarrierPlan).includes(sub.companyPlan.name as CarrierPlan)
            ? (sub.companyPlan.name as CarrierPlan)
            : null);
        const weight = carrierPlanWeight(plan);
        const current = companyToPlanWeight.get(sub.companyId) ?? 0;
        if (weight > current) {
          companyToPlanWeight.set(sub.companyId, weight);
        }
      }

      filteredShipments.sort((a, b) => {
        const aWeight = companyToPlanWeight.get(a.companyId) ?? 0;
        const bWeight = companyToPlanWeight.get(b.companyId) ?? 0;
        if (aWeight !== bWeight) return bWeight - aWeight; // higher tier first

        const depDiff = a.departureTime.getTime() - b.departureTime.getTime();
        if (depDiff !== 0) return depDiff; // soonest departure first

        const createdDiff = b.createdAt.getTime() - a.createdAt.getTime();
        if (createdDiff !== 0) return createdDiff; // newest first

        return a.id.localeCompare(b.id); // stable tie-break
      });
    }

    // Calculate total before pagination
    const total = filteredShipments.length;

    // Apply pagination after filtering
    const paginatedShipments = filteredShipments.slice(
      params.offset,
      params.offset + params.limit
    );

    return { shipments: paginatedShipments, total };
  },

  async countActiveByCompany(companyId: string): Promise<number> {
    return prisma.shipmentSlot.count({
      where: {
        companyId,
        status: {
          in: ['DRAFT', 'PUBLISHED'],
        },
      },
    });
  },
};

