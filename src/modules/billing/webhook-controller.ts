import { Request, Response, NextFunction } from 'express';
import { handleBillingWebhook } from './webhook-service';

export const billingWebhookController = {
  async handleWebhook(req: Request, res: Response, _next: NextFunction) {
    try {
      const sig = req.headers['stripe-signature'] as string;
      
      if (!sig) {
        console.error('[Billing Webhook] Missing stripe-signature header');
        return res.status(400).json({
          status: 'error',
          message: 'Missing stripe-signature header',
        });
      }

      // req.body should be a Buffer when using express.raw()
      const payload = req.body as Buffer;
      
      // Debug logging
      console.log('[Billing Webhook] Request details:', {
        hasBody: !!req.body,
        bodyType: typeof req.body,
        isBuffer: Buffer.isBuffer(req.body),
        bodyLength: req.body ? (Buffer.isBuffer(req.body) ? req.body.length : JSON.stringify(req.body).length) : 0,
        hasSignature: !!sig,
        path: req.path,
        method: req.method,
      });
      
      if (!Buffer.isBuffer(payload)) {
        let payloadPreview = '';
        try {
          if (typeof payload === 'string') {
            payloadPreview = (payload as string).substring(0, 100);
          } else if (payload !== null && payload !== undefined) {
            const payloadStr = JSON.stringify(payload);
            payloadPreview = payloadStr.substring(0, 100);
          } else {
            payloadPreview = 'null or undefined';
          }
        } catch (e) {
          payloadPreview = 'Unable to stringify payload';
        }
        
        console.error('[Billing Webhook] Payload is not a Buffer:', {
          type: typeof payload,
          isBuffer: Buffer.isBuffer(payload),
          payload: payloadPreview,
        });
        return res.status(400).json({
          status: 'error',
          message: `Invalid payload format. Expected Buffer, got ${typeof payload}. This usually means the raw body parser middleware is not working correctly.`,
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
        hasSignature: !!req.headers['stripe-signature'],
        bodyType: typeof req.body,
        isBuffer: Buffer.isBuffer(req.body),
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

