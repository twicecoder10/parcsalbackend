import { z } from 'zod';
import { bookingIdValidator } from '../../utils/validators';

const bookingStatusEnum = z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'IN_TRANSIT', 'DELIVERED']);
const bookingTrackingStatusEnum = z.enum([
  'BOOKED',
  'ITEM_RECEIVED',
  'PACKED',
  'READY_FOR_DISPATCH',
  'IN_TRANSIT',
  'ARRIVED_AT_DESTINATION',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELAYED',
  'CUSTOMS_HOLD',
  'CUSTOMS_CLEARED',
  'DELIVERY_FAILED',
  'DAMAGED',
  'LOST',
  'RETURNED',
  'CANCELLED',
]);

const parcelTypeEnum = z.enum(['DOCUMENT', 'PACKAGE', 'FRAGILE', 'ELECTRONICS', 'CLOTHING', 'FOOD', 'MEDICINE', 'OTHER']);
const pickupMethodEnum = z.enum(['PICKUP_FROM_SENDER', 'DROP_OFF_AT_COMPANY']);
const deliveryMethodEnum = z.enum(['RECEIVER_PICKS_UP', 'DELIVERED_TO_RECEIVER']);

export const createBookingSchema = z.object({
  body: z.object({
    shipmentSlotId: z.string().uuid('Invalid shipment slot ID'),
    requestedWeightKg: z.number().positive().optional().nullable(),
    requestedItemsCount: z.number().int().positive().optional().nullable(),
    notes: z.string().optional().nullable(),
    // New parcel information fields
    parcelType: parcelTypeEnum.optional().nullable(),
    weight: z.number().positive().optional().nullable(),
    value: z.number().nonnegative().optional().nullable(),
    length: z.number().positive().optional().nullable(),
    width: z.number().positive().optional().nullable(),
    height: z.number().positive().optional().nullable(),
    description: z.string().optional().nullable(),
    images: z.array(z.string().url('Invalid image URL')).optional().default([]),
    pickupMethod: pickupMethodEnum,
    deliveryMethod: deliveryMethodEnum,
    // Pickup address fields (required when pickupMethod is PICKUP_FROM_SENDER)
    pickupAddress: z.string().optional().nullable(),
    pickupCity: z.string().optional().nullable(),
    pickupState: z.string().optional().nullable(),
    pickupCountry: z.string().optional().nullable(),
    pickupPostalCode: z.string().optional().nullable(),
    pickupContactName: z.string().optional().nullable(),
    pickupContactPhone: z.string().optional().nullable(),
    // Pickup warehouse ID (required when pickupMethod is DROP_OFF_AT_COMPANY)
    pickupWarehouseId: z.string().uuid('Invalid warehouse address ID').optional().nullable(),
    // Delivery address fields (required when deliveryMethod is DELIVERED_TO_RECEIVER)
    deliveryAddress: z.string().optional().nullable(),
    deliveryCity: z.string().optional().nullable(),
    deliveryState: z.string().optional().nullable(),
    deliveryCountry: z.string().optional().nullable(),
    deliveryPostalCode: z.string().optional().nullable(),
    deliveryContactName: z.string().optional().nullable(),
    deliveryContactPhone: z.string().optional().nullable(),
    // Delivery warehouse ID (required when deliveryMethod is RECEIVER_PICKS_UP)
    deliveryWarehouseId: z.string().uuid('Invalid warehouse address ID').optional().nullable(),
  }).refine((data) => {
    // Validate pickup method requirements
    if (data.pickupMethod === 'PICKUP_FROM_SENDER') {
      return !!(data.pickupAddress && data.pickupCity && data.pickupCountry);
    } else if (data.pickupMethod === 'DROP_OFF_AT_COMPANY') {
      return !!data.pickupWarehouseId;
    }
    return true;
  }, {
    message: 'Pickup address details are required when pickup method is PICKUP_FROM_SENDER, or warehouse ID is required when DROP_OFF_AT_COMPANY',
    path: ['pickupMethod'],
  }).refine((data) => {
    // Validate delivery method requirements
    if (data.deliveryMethod === 'DELIVERED_TO_RECEIVER') {
      return !!(data.deliveryAddress && data.deliveryCity && data.deliveryCountry);
    } else if (data.deliveryMethod === 'RECEIVER_PICKS_UP') {
      return !!data.deliveryWarehouseId;
    }
    return true;
  }, {
    message: 'Delivery address details are required when delivery method is DELIVERED_TO_RECEIVER, or warehouse ID is required when RECEIVER_PICKS_UP',
    path: ['deliveryMethod'],
  }),
});

export const updateBookingStatusSchema = z.object({
  params: z.object({
    id: bookingIdValidator,
  }),
  body: z.object({
    status: bookingStatusEnum,
  }),
});

export const getBookingSchema = z.object({
  params: z.object({
    id: bookingIdValidator,
  }),
});

export const listBookingsSchema = z.object({
  query: z.object({
    limit: z.string().optional(),
    offset: z.string().optional(),
    status: bookingStatusEnum.optional(),
    search: z.string().optional(),
  }),
});

export const addProofImagesSchema = z.object({
  params: z.object({
    id: bookingIdValidator,
  }),
  body: z.object({
    pickupProofImages: z.array(z.string().url('Invalid image URL')).optional(),
    deliveryProofImages: z.array(z.string().url('Invalid image URL')).optional(),
  }),
});

const bookingTrackingEvidenceSchema = z.array(
  z.object({
    url: z.string().url('Invalid evidence URL'),
    type: z.string().optional(),
    name: z.string().optional(),
  })
).optional().nullable();

export const addBookingTrackingEventSchema = z.object({
  params: z.object({
    id: bookingIdValidator,
  }),
  body: z.object({
    status: bookingTrackingStatusEnum,
    note: z.string().optional().nullable(),
    location: z.string().optional().nullable(),
    evidence: bookingTrackingEvidenceSchema,
  }),
});

export const getBookingTrackingSchema = z.object({
  params: z.object({
    id: bookingIdValidator,
  }),
});

export const getPublicBookingTrackingSchema = z.object({
  params: z.object({
    id: bookingIdValidator,
  }),
});

export const getPublicBookingTrackingQuerySchema = z.object({
  query: z
    .object({
      id: bookingIdValidator.optional(),
      bookingId: bookingIdValidator.optional(),
    })
    .refine((data) => Boolean(data.id || data.bookingId), {
      message: 'Booking id is required',
      path: ['id'],
    }),
});

export const scanBarcodeSchema = z.object({
  body: z.object({
    barcode: z.string().min(1, 'Barcode is required'),
  }),
});

export type CreateBookingDto = z.infer<typeof createBookingSchema>['body'];
export type UpdateBookingStatusDto = z.infer<typeof updateBookingStatusSchema>['body'];
export type AddProofImagesDto = z.infer<typeof addProofImagesSchema>['body'];
export type ScanBarcodeDto = z.infer<typeof scanBarcodeSchema>['body'];
export type AddBookingTrackingEventDto = z.infer<typeof addBookingTrackingEventSchema>['body'];

