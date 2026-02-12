import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { rfqService } from './service';
import { CreateQuoteDto, CreateShipmentRequestDto } from './dto';

export const rfqController = {
  async createRequest(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as CreateShipmentRequestDto;
      const data = await rfqService.createRequest(req, dto);
      res.status(201).json({ status: 'success', data });
    } catch (error) {
      next(error);
    }
  },

  async listMyRequests(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await rfqService.listMyRequests(req, req.query);
      res.status(200).json({ status: 'success', ...result });
    } catch (error) {
      next(error);
    }
  },

  async getMyRequestById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await rfqService.getMyRequestById(req, req.params.id);
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      next(error);
    }
  },

  async acceptQuote(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await rfqService.acceptQuote(
        req,
        req.params.id,
        req.params.quoteId
      );
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      next(error);
    }
  },

  async listMarketplaceRequests(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await rfqService.listMarketplaceRequests(req, req.query);
      res.status(200).json({ status: 'success', ...result });
    } catch (error) {
      next(error);
    }
  },

  async getMarketplaceRequestById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await rfqService.getMarketplaceRequestById(req, req.params.id);
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      next(error);
    }
  },

  async createQuote(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as CreateQuoteDto;
      const data = await rfqService.createQuote(req, req.params.id, dto);
      res.status(201).json({ status: 'success', data });
    } catch (error) {
      next(error);
    }
  },

  async listCompanyQuotes(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await rfqService.listCompanyQuotes(req, req.query);
      res.status(200).json({ status: 'success', ...result });
    } catch (error) {
      next(error);
    }
  },
};
