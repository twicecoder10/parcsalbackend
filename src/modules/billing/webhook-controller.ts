import { Request, Response, NextFunction } from 'express';
import { handleBillingWebhook } from './webhook-service';

export const billingWebhookController = {
  async handleWebhook(req: Request, res: Response, _next: NextFunction) {
    try {
      const sig = req.headers['stripe-signature'] as string;
      
      if (!sig) {
        return res.status(400).json({
          status: 'error',
          message: 'Missing stripe-signature header',
        });
      }

      // req.body should be a Buffer when using express.raw()
      const payload = req.body as Buffer;
      
      if (!Buffer.isBuffer(payload)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid payload format',
        });
      }

      const result = await handleBillingWebhook(payload, sig);

      return res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error: any) {
      console.error(`[Billing Webhook Controller] Webhook error:`, {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });

      // Return 400 for client errors, 500 for server errors
      const statusCode = error.statusCode || 500;
      return res.status(statusCode).json({
        status: 'error',
        message: error.message || 'Webhook processing failed',
      });
    }
  },
};

