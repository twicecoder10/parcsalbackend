import { Router } from 'express';
import { marketingController } from './controller';
import { validate } from '../../middleware/validator';
import { authenticate, requireRole, requireCompanyAccess } from '../../middleware/auth';
import {
  createCampaignSchema,
  updateCampaignSchema,
  listCampaignsSchema,
  getCampaignSchema,
  previewRecipientsSchema,
  sendCampaignSchema,
  scheduleCampaignSchema,
  cancelCampaignSchema,
  updateMarketingConsentSchema,
  unsubscribeSchema,
} from './dto';

// Admin routes - SUPER_ADMIN only
const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(requireRole('SUPER_ADMIN'));

adminRouter.post(
  '/campaigns',
  validate(createCampaignSchema),
  marketingController.createCampaign
);
adminRouter.get(
  '/campaigns',
  validate(listCampaignsSchema),
  marketingController.listCampaigns
);
adminRouter.get(
  '/campaigns/:id',
  validate(getCampaignSchema),
  marketingController.getCampaign
);
adminRouter.put(
  '/campaigns/:id',
  validate(updateCampaignSchema),
  marketingController.updateCampaign
);
adminRouter.get(
  '/campaigns/:id/preview',
  validate(previewRecipientsSchema),
  marketingController.previewRecipients
);
adminRouter.post(
  '/campaigns/:id/send',
  validate(sendCampaignSchema),
  marketingController.sendCampaign
);
adminRouter.post(
  '/campaigns/:id/schedule',
  validate(scheduleCampaignSchema),
  marketingController.scheduleCampaign
);
adminRouter.post(
  '/campaigns/:id/cancel',
  validate(cancelCampaignSchema),
  marketingController.cancelCampaign
);
adminRouter.delete(
  '/campaigns/:id',
  validate(getCampaignSchema),
  marketingController.deleteCampaign
);

// Company routes - COMPANY_ADMIN and COMPANY_STAFF
const companyRouter = Router();
companyRouter.use(authenticate);
companyRouter.use(requireCompanyAccess);

companyRouter.post(
  '/campaigns',
  validate(createCampaignSchema),
  marketingController.createCampaign
);
companyRouter.get(
  '/campaigns',
  validate(listCampaignsSchema),
  marketingController.listCampaigns
);
companyRouter.get(
  '/campaigns/:id',
  validate(getCampaignSchema),
  marketingController.getCampaign
);
companyRouter.put(
  '/campaigns/:id',
  validate(updateCampaignSchema),
  marketingController.updateCampaign
);
companyRouter.get(
  '/campaigns/:id/preview',
  validate(previewRecipientsSchema),
  marketingController.previewRecipients
);
companyRouter.post(
  '/campaigns/:id/send',
  validate(sendCampaignSchema),
  marketingController.sendCampaign
);
companyRouter.post(
  '/campaigns/:id/schedule',
  validate(scheduleCampaignSchema),
  marketingController.scheduleCampaign
);
companyRouter.post(
  '/campaigns/:id/cancel',
  validate(cancelCampaignSchema),
  marketingController.cancelCampaign
);
companyRouter.delete(
  '/campaigns/:id',
  validate(getCampaignSchema),
  marketingController.deleteCampaign
);

// User consent routes - any authenticated user
const consentRouter = Router();
consentRouter.use(authenticate);

consentRouter.get('/marketing-consent', marketingController.getConsent);
consentRouter.put(
  '/marketing-consent',
  validate(updateMarketingConsentSchema),
  marketingController.updateConsent
);

// Public unsubscribe route - no authentication required
const publicRouter = Router();
publicRouter.get(
  '/unsubscribe',
  validate(unsubscribeSchema),
  marketingController.unsubscribe
);

export { adminRouter, companyRouter, consentRouter, publicRouter };

