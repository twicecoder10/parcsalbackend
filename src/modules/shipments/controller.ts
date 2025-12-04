import { Request, Response, NextFunction } from 'express';
import { shipmentService } from './service';
import {
  CreateShipmentDto,
  UpdateShipmentDto,
  UpdateShipmentStatusDto,
  UpdateShipmentTrackingStatusDto,
  SearchShipmentsDto,
} from './dto';
import { AuthRequest } from '../../middleware/auth';

export const shipmentController = {
  async createShipment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as CreateShipmentDto;
      const shipment = await shipmentService.createShipment(req, dto);

      res.status(201).json({
        status: 'success',
        data: shipment,
      });
    } catch (error) {
      next(error);
    }
  },

  async getMyShipments(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await shipmentService.getMyShipments(req, req.query);

      res.status(200).json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateShipment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const dto = req.body as UpdateShipmentDto;
      const shipment = await shipmentService.updateShipment(req, id, dto);

      res.status(200).json({
        status: 'success',
        data: shipment,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateShipmentStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const dto = req.body as UpdateShipmentStatusDto;
      const shipment = await shipmentService.updateShipmentStatus(req, id, dto);

      res.status(200).json({
        status: 'success',
        data: shipment,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateShipmentTrackingStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const dto = req.body as UpdateShipmentTrackingStatusDto;
      const shipment = await shipmentService.updateShipmentTrackingStatus(req, id, dto);

      res.status(200).json({
        status: 'success',
        data: shipment,
        message: 'Tracking status updated and bookings have been updated accordingly',
      });
    } catch (error) {
      next(error);
    }
  },

  async searchShipments(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const query = req.query as unknown as SearchShipmentsDto;
      const result = await shipmentService.searchShipments(query);

      res.status(200).json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getShipmentById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const shipment = await shipmentService.getShipmentById(id);

      res.status(200).json({
        status: 'success',
        data: shipment,
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteShipment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await shipmentService.deleteShipment(req, id);

      res.status(200).json({
        status: 'success',
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  },

  async getShipmentBookings(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { shipmentId } = req.params;
      const bookings = await shipmentService.getShipmentBookings(req, shipmentId);

      res.status(200).json({
        status: 'success',
        data: bookings,
      });
    } catch (error) {
      next(error);
    }
  },

  async trackShipmentByBooking(req: Request, res: Response, next: NextFunction) {
    try {
      const { bookingId } = req.params;
      const trackingInfo = await shipmentService.trackShipmentByBooking(bookingId);

      res.status(200).json({
        status: 'success',
        data: trackingInfo,
      });
    } catch (error) {
      next(error);
    }
  },
};

