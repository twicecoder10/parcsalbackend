import { Router } from 'express';
import { publicSeoController } from './publicSeo.controller';

const router = Router();

router.get('/sitemap-shipments', publicSeoController.getSitemapShipments);
router.get('/shipment/:id', publicSeoController.getPublicShipment);

export default router;

