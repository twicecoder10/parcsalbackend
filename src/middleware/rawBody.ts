import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to capture raw body for Stripe webhook signature verification
 * This should be applied BEFORE express.json() middleware for webhook routes
 */
export function rawBodyMiddleware(req: Request, _res: Response, next: NextFunction) {
  if (req.is('application/json')) {
    let data = '';
    req.setEncoding('utf8');

    req.on('data', (chunk) => {
      data += chunk;
    });

    req.on('end', () => {
      (req as any).rawBody = Buffer.from(data, 'utf8');
      next();
    });
  } else {
    next();
  }
}

/**
 * Alternative: Use express.raw() middleware for webhook routes
 * Example: app.use('/webhooks', express.raw({ type: 'application/json' }))
 */

