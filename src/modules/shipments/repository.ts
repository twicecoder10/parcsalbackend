import prisma from '../../config/database';
import { ShipmentSlot, ShipmentStatus, ShipmentMode, PricingModel, SlotTrackingStatus } from '@prisma/client';
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

    // Handle date filtering with OR logic for departure/arrival
    const hasDepartureFilter = filters.departureFrom || filters.departureTo;
    const hasArrivalFilter = filters.arrivalFrom || filters.arrivalTo;
    
    if (hasDepartureFilter && hasArrivalFilter) {
      // OR condition: departure between dates OR arrival between dates
      const departureCondition: any = {};
      if (filters.departureFrom) departureCondition.gte = filters.departureFrom;
      if (filters.departureTo) departureCondition.lte = filters.departureTo;
      
      const arrivalCondition: any = {};
      if (filters.arrivalFrom) arrivalCondition.gte = filters.arrivalFrom;
      if (filters.arrivalTo) arrivalCondition.lte = filters.arrivalTo;
      
      where.OR = [
        {
          departureTime: departureCondition,
        },
        {
          arrivalTime: arrivalCondition,
        },
      ];
    } else if (hasDepartureFilter) {
      // Only departure filter
      where.departureTime = {};
      if (filters.departureFrom) {
        where.departureTime.gte = filters.departureFrom;
      }
      if (filters.departureTo) {
        where.departureTime.lte = filters.departureTo;
      }
    } else if (hasArrivalFilter) {
      // Only arrival filter
      where.arrivalTime = {};
      if (filters.arrivalFrom) {
        where.arrivalTime.gte = filters.arrivalFrom;
      }
      if (filters.arrivalTo) {
        where.arrivalTime.lte = filters.arrivalTo;
      }
    }

    const shipments = await prisma.shipmentSlot.findMany({
      where,
      skip: params.offset,
      take: params.limit,
      orderBy: {
        departureTime: 'asc',
      },
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
    let filteredShipments = shipments;
    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      filteredShipments = shipments.filter((shipment) => {
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

    return { shipments: filteredShipments, total: filteredShipments.length };
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

