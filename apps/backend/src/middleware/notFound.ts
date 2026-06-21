import { Request, Response } from 'express';

export function notFound(req: Request, res: Response): Response {
  return res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`
  });
}
