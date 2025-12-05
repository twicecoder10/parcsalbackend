import { Router } from 'express';
import { uploadController } from './controller';
import { authenticate, requireCompanyAccess, requireRole } from '../../middleware/auth';
import { parcelImageUpload, proofImageUpload } from '../../utils/upload';

const router = Router();

// Customer routes - Parcel image uploads
router.post(
  '/parcel-images',
  authenticate,
  requireRole('CUSTOMER'),
  parcelImageUpload.array('images', 10), // 'images' is the field name, max 10 files
  uploadController.uploadParcelImages
);

// Company routes - Proof image uploads
router.post(
  '/proof-images',
  authenticate,
  requireCompanyAccess,
  proofImageUpload.array('images', 5), // 'images' is the field name, max 5 files
  uploadController.uploadProofImages
);

export default router;

