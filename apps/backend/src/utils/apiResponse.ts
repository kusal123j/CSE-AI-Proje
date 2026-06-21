import { Response } from 'express';

export function ok(res: Response, data: unknown, statusCode = 200): Response {
  return res.status(statusCode).json({ success: true, data });
}

export function created(res: Response, data: unknown): Response {
  return ok(res, data, 201);
}
