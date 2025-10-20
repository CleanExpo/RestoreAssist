import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error('Error:', err);

  // Add context to Sentry (Sentry.setupExpressErrorHandler already captured the error)
  Sentry.withScope((scope) => {
    // Add request details
    scope.setContext('request', {
      method: req.method,
      url: req.url,
      path: req.path,
      query: req.query,
      headers: {
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type'],
        'origin': req.headers['origin'],
      },
    });

    // Add user context if available
    if (req.user) {
      scope.setUser({
        id: req.user.userId,
        email: req.user.email,
        username: req.user.name,
      });
      scope.setTag('user.role', req.user.role);
    }

    // Add route tags for easier filtering
    scope.setTag('route.path', req.path);
    scope.setTag('route.method', req.method);

    // Log error level based on status code
    const statusCode = (err as any).statusCode || 500;
    if (statusCode >= 500) {
      scope.setLevel('error');
    } else if (statusCode >= 400) {
      scope.setLevel('warning');
    }

    // For serverless functions, ensure the error is flushed before responding
    if (process.env.VERCEL) {
      Sentry.captureException(err);
      // Flush immediately for serverless - wait up to 2 seconds
      Sentry.flush(2000).then(() => {
        sendErrorResponse(err, req, res);
      }).catch(() => {
        // If flush fails, still send response
        sendErrorResponse(err, req, res);
      });
    } else {
      sendErrorResponse(err, req, res);
    }
  });
}

// Helper function to send error response
function sendErrorResponse(err: Error, req: Request, res: Response) {
  const statusCode = (err as any).statusCode || 500;

  res.status(statusCode).json({
    error: statusCode >= 500 ? 'Internal server error' : 'Request error',
    message: process.env.NODE_ENV === 'development' ? err.message :
             statusCode >= 500 ? 'Something went wrong' : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}
