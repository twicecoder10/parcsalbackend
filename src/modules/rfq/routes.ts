import { Router } from 'express';
import { authenticate, requireCompanyAccess, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validator';
import { rfqController } from './controller';
import {
  acceptQuoteSchema,
  createQuoteSchema,
  createShipmentRequestSchema,
  getShipmentRequestSchema,
  listCompanyQuotesSchema,
  listShipmentRequestsSchema,
} from './dto';

const router = Router();

// Customer endpoints
router.post(
  '/requests',
  authenticate,
  requireRole('CUSTOMER'),
  validate(createShipmentRequestSchema),
  rfqController.createRequest
);

router.get(
  '/requests',
  authenticate,
  requireRole('CUSTOMER'),
  validate(listShipmentRequestsSchema),
  rfqController.listMyRequests
);

router.get(
  '/requests/:id',
  authenticate,
  requireRole('CUSTOMER'),
  validate(getShipmentRequestSchema),
  rfqController.getMyRequestById
);

router.post(
  '/requests/:id/accept-quote/:quoteId',
  authenticate,
  requireRole('CUSTOMER'),
  validate(acceptQuoteSchema),
  rfqController.acceptQuote
);

// Company endpoints (open marketplace)
router.get(
  '/company/requests',
  authenticate,
  requireCompanyAccess,
  validate(listShipmentRequestsSchema),
  rfqController.listMarketplaceRequests
);

router.get(
  '/company/requests/:id',
  authenticate,
  requireCompanyAccess,
  validate(getShipmentRequestSchema),
  rfqController.getMarketplaceRequestById
);

router.post(
  '/company/requests/:id/quote',
  authenticate,
  requireCompanyAccess,
  validate(createQuoteSchema),
  rfqController.createQuote
);

router.get(
  '/company/quotes',
  authenticate,
  requireCompanyAccess,
  validate(listCompanyQuotesSchema),
  rfqController.listCompanyQuotes
);

export default router;
