import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { BadRequestError } from '../utils/errors';

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      
      // Assign transformed values back to request object
      // This ensures Zod transformations (like string -> Date) are applied
      if (parsed.body) {
        req.body = parsed.body;
      }
      if (parsed.query) {
        req.query = parsed.query;
      }
      if (parsed.params) {
        req.params = parsed.params;
      }
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map((err) => {
          const path = err.path.join('.');
          return path ? `${path}: ${err.message}` : err.message;
        });
        next(new BadRequestError(`Validation failed: ${errors.join(', ')}`));
      } else {
        next(error);
      }
    }
  };
}

