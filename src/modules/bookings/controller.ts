import { Response, NextFunction } from 'express';
import { bookingService } from './service';
import { CreateBookingDto, UpdateBookingStatusDto, AddProofImagesDto, ScanBarcodeDto } from './dto';
import { AuthRequest } from '../../middleware/auth';

export const bookingController = {
  async createBooking(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as CreateBookingDto;
      const booking = await bookingService.createBooking(req, dto);

      res.status(201).json({
        status: 'success',
        data: booking,
      });
    } catch (error) {
      next(error);
    }
  },

  async getMyBookings(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await bookingService.getMyBookings(req, req.query);

      res.status(200).json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getCompanyBookings(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await bookingService.getCompanyBookings(req, req.query);

      res.status(200).json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateBookingStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const dto = req.body as UpdateBookingStatusDto;
      const booking = await bookingService.updateBookingStatus(req, id, dto);

      res.status(200).json({
        status: 'success',
        data: booking,
      });
    } catch (error) {
      next(error);
    }
  },

  async getBookingById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const booking = await bookingService.getBookingById(req, id);

      res.status(200).json({
        status: 'success',
        data: booking,
      });
    } catch (error) {
      next(error);
    }
  },

  async acceptBooking(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const booking = await bookingService.acceptBooking(req, id);

      res.status(200).json({
        status: 'success',
        data: booking,
      });
    } catch (error) {
      next(error);
    }
  },

  async rejectBooking(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      if (!reason || typeof reason !== 'string') {
        return res.status(400).json({
          status: 'error',
          message: 'Rejection reason is required',
        });
      }
      const booking = await bookingService.rejectBooking(req, id, reason);

      return res.status(200).json({
        status: 'success',
        data: booking,
      });
    } catch (error) {
      return next(error);
    }
  },

  async getBookingStats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const stats = await bookingService.getBookingStats(req);
      res.status(200).json({
        status: 'success',
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  },

  async addProofImages(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const dto = req.body as AddProofImagesDto;
      const booking = await bookingService.addProofImages(req, id, dto);

      res.status(200).json({
        status: 'success',
        data: booking,
      });
    } catch (error) {
      next(error);
    }
  },

  async getBookingLabel(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const labelData = await bookingService.getBookingLabel(req, id);

      res.status(200).json({
        status: 'success',
        data: labelData,
      });
    } catch (error) {
      next(error);
    }
  },

  async regenerateBookingLabel(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const booking = await bookingService.regenerateBookingLabel(req, id);

      res.status(200).json({
        status: 'success',
        data: booking,
      });
    } catch (error) {
      next(error);
    }
  },

  async scanBarcode(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as ScanBarcodeDto;
      const booking = await bookingService.scanBarcode(req, dto.barcode);

      res.status(200).json({
        status: 'success',
        data: booking,
        message: 'Barcode scanned successfully',
      });
    } catch (error) {
      next(error);
    }
  },
};

