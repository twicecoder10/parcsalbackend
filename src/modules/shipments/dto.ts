import { z } from 'zod';
import { bookingIdValidator } from '../../utils/validators';

const shipmentModeEnum = z.enum(['AIR_CARGO', 'SEA_CARGO', 'AIR_FREIGHT']);
const pricingModelEnum = z.enum(['PER_KG', 'PER_ITEM', 'FLAT']);
const shipmentStatusEnum = z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']);

export const createShipmentSchema = z.object({
  body: z.object({
    originCountry: z.string().min(1, 'Origin country is required'),
    originCity: z.string().min(1, 'Origin city is required'),
    destinationCountry: z.string().min(1, 'Destination country is required'),
    destinationCity: z.string().min(1, 'Destination city is required'),
    departureTime: z.string().datetime('Invalid departure time'),
    arrivalTime: z.string().datetime('Invalid arrival time'),
    mode: shipmentModeEnum,
    totalCapacityKg: z.number().positive().optional().nullable(),
    totalCapacityItems: z.number().int().positive().optional().nullable(),
    pricingModel: pricingModelEnum,
    pricePerKg: z.number().positive().optional().nullable(),
    pricePerItem: z.number().positive().optional().nullable(),
    flatPrice: z.number().positive().optional().nullable(),
    cutoffTimeForReceivingItems: z.string().datetime('Invalid cutoff time'),
    status: shipmentStatusEnum.optional().default('DRAFT'),
    // Info/notes for customers (rules, conditions, extra charges, etc.)
    bookingNotes: z.string().max(5000).optional().nullable(),
    // Pickup/delivery options: at least one departure and one destination option must be true
    allowsPickupFromSender: z.boolean().optional().default(true),
    allowsDropOffAtCompany: z.boolean().optional().default(true),
    allowsDeliveredToReceiver: z.boolean().optional().default(true),
    allowsReceiverPicksUp: z.boolean().optional().default(true),
  }).refine(
    (data) => data.allowsPickupFromSender || data.allowsDropOffAtCompany,
    { message: 'At least one departure option (pickup from sender or drop off at company) must be allowed', path: ['allowsPickupFromSender'] }
  ).refine(
    (data) => data.allowsDeliveredToReceiver || data.allowsReceiverPicksUp,
    { message: 'At least one destination option (delivered to receiver or receiver picks up) must be allowed', path: ['allowsDeliveredToReceiver'] }
  ),
});

export const updateShipmentSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    originCountry: z.string().min(1).optional(),
    originCity: z.string().min(1).optional(),
    destinationCountry: z.string().min(1).optional(),
    destinationCity: z.string().min(1).optional(),
    departureTime: z.string().datetime().optional(),
    arrivalTime: z.string().datetime().optional(),
    mode: shipmentModeEnum.optional(),
    totalCapacityKg: z.number().positive().optional().nullable(),
    totalCapacityItems: z.number().int().positive().optional().nullable(),
    pricingModel: pricingModelEnum.optional(),
    pricePerKg: z.number().positive().optional().nullable(),
    pricePerItem: z.number().positive().optional().nullable(),
    flatPrice: z.number().positive().optional().nullable(),
    cutoffTimeForReceivingItems: z.string().datetime().optional(),
    bookingNotes: z.string().max(5000).optional().nullable(),
    allowsPickupFromSender: z.boolean().optional(),
    allowsDropOffAtCompany: z.boolean().optional(),
    allowsDeliveredToReceiver: z.boolean().optional(),
    allowsReceiverPicksUp: z.boolean().optional(),
  }).refine(
    (data) => {
      const pickup = data.allowsPickupFromSender;
      const dropOff = data.allowsDropOffAtCompany;
      if (pickup === undefined && dropOff === undefined) return true;
      return (pickup ?? true) || (dropOff ?? true);
    },
    { message: 'At least one departure option must be allowed', path: ['allowsPickupFromSender'] }
  ).refine(
    (data) => {
      const delivered = data.allowsDeliveredToReceiver;
      const picksUp = data.allowsReceiverPicksUp;
      if (delivered === undefined && picksUp === undefined) return true;
      return (delivered ?? true) || (picksUp ?? true);
    },
    { message: 'At least one destination option must be allowed', path: ['allowsDeliveredToReceiver'] }
  ),
});

export const updateShipmentStatusSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    status: shipmentStatusEnum,
  }),
});

const slotTrackingStatusEnum = z.enum(['PENDING', 'IN_TRANSIT', 'ARRIVED_AT_DESTINATION', 'DELAYED', 'DELIVERED']);

export const updateShipmentTrackingStatusSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    trackingStatus: slotTrackingStatusEnum,
  }),
});

export const searchShipmentsSchema = z.object({
  query: z.object({
    originCountry: z.string().optional(),
    originCity: z.string().optional(),
    destinationCountry: z.string().optional(),
    destinationCity: z.string().optional(),
    mode: shipmentModeEnum.optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    arrivalFrom: z.string().datetime().optional(),
    arrivalTo: z.string().datetime().optional(),
    minPrice: z.string().optional(),
    maxPrice: z.string().optional(),
    limit: z.string().optional(),
    offset: z.string().optional(),
  }),
});

export const getShipmentSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const trackShipmentByBookingSchema = z.object({
  params: z.object({
    bookingId: bookingIdValidator,
  }),
});

export type CreateShipmentDto = z.infer<typeof createShipmentSchema>['body'];
export type UpdateShipmentDto = z.infer<typeof updateShipmentSchema>['body'];
export type UpdateShipmentStatusDto = z.infer<typeof updateShipmentStatusSchema>['body'];
export type UpdateShipmentTrackingStatusDto = z.infer<typeof updateShipmentTrackingStatusSchema>['body'];
export type SearchShipmentsDto = z.infer<typeof searchShipmentsSchema>['query'];

