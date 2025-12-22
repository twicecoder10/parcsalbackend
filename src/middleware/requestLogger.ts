import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

export function requestLogger(
  req: Request | AuthRequest,
  res: Response,
  next: NextFunction
) {
  const startTime = Date.now();
  const method = req.method;
  const url = req.originalUrl || req.url;
  const userAgent = req.get('user-agent') || 'unknown';
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  
  // Get user info if authenticated
  const userId = (req as AuthRequest).user?.id;
  const userRole = (req as AuthRequest).user?.role;
  const userEmail = (req as AuthRequest).user?.email;

  // Log request start
  const logData: any = {
    method,
    url,
    ip,
    userAgent,
    timestamp: new Date().toISOString(),
  };

  if (userId) {
    logData.userId = userId;
    logData.userRole = userRole;
    if (userEmail) {
      logData.userEmail = userEmail;
    }
  }

  // Only log requests for errors/warnings (excluding health checks and webhooks)

  // Capture response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    const responseLog: any = {
      method,
      url,
      statusCode,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
    };

    if (userId) {
      responseLog.userId = userId;
    }

    // Only log errors and warnings (excluding health checks and webhooks)
    if (!url.includes('/health') && !url.includes('/webhook') && statusCode >= 400) {
      const logLevel = statusCode >= 500 ? 'error' : 'warn';
      console[logLevel](`[API Response] ${method} ${url} - ${statusCode} (${duration}ms)`, responseLog);
    }
  });

  next();
}

