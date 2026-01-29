import { Request, Response, NextFunction } from 'express';
import { publicSeoService } from './publicSeo.service';

export const publicSeoController = {
  async getSitemapShipments(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await publicSeoService.getSitemapShipments(req.query);

      res.set('Cache-Control', 'public, max-age=3600');
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },

  async getPublicShipment(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const shipment = await publicSeoService.getPublicShipmentById(id);

      res.set('Cache-Control', 'public, max-age=300');
      res.status(200).json(shipment);
    } catch (error) {
      next(error);
    }
  },
};

