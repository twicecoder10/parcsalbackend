import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { uploadFile } from '../../utils/upload';
import { BadRequestError } from '../../utils/errors';

export const uploadController = {
  // Customer upload - Parcel images
  async uploadParcelImages(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user || req.user.role !== 'CUSTOMER') {
        throw new BadRequestError('Only customers can upload parcel images');
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        throw new BadRequestError('No files uploaded');
      }

      // Upload files to Azure Blob Storage
      const uploadResults = await Promise.all(
        files.map((file) => uploadFile(file, 'parcel'))
      );

      const imageUrls = uploadResults.map((result) => result.url);

      res.status(200).json({
        status: 'success',
        data: {
          images: imageUrls,
          count: imageUrls.length,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Company upload - Proof images
  async uploadProofImages(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new BadRequestError('Authentication required');
      }

      if (req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'COMPANY_STAFF' && req.user.role !== 'SUPER_ADMIN') {
        throw new BadRequestError('Only company staff can upload proof images');
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        throw new BadRequestError('No files uploaded');
      }

      // Upload files to Azure Blob Storage
      const uploadResults = await Promise.all(
        files.map((file) => uploadFile(file, 'proof'))
      );

      const imageUrls = uploadResults.map((result) => result.url);

      res.status(200).json({
        status: 'success',
        data: {
          images: imageUrls,
          count: imageUrls.length,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};

