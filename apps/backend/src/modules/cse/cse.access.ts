import { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env';

function providedImportSecret(req: Request): string {
  return (req.header('x-cse-import-secret') ?? req.header('x-cse-internal-secret') ?? '').trim();
}

function hasValidImportSecret(req: Request): boolean {
  const configuredSecret = env.CSE_IMPORT_INTERNAL_SECRET.trim();
  const providedSecret = providedImportSecret(req);
  return Boolean(configuredSecret && providedSecret && configuredSecret === providedSecret);
}

function denyCseImportAccess(res: Response, message: string): void {
  res.status(403).json({
    success: false,
    code: 'CSE_IMPORT_ACCESS_DENIED',
    message
  });
}

export function cseImportReadAccessGuard(req: Request, res: Response, next: NextFunction): void {
  if (env.CSE_IMPORT_ALLOW_UNPROTECTED_READS || env.CSE_IMPORT_ALLOW_UNPROTECTED_MANUAL_RUN || hasValidImportSecret(req)) {
    next();
    return;
  }

  denyCseImportAccess(res, 'CSE import monitoring access denied. Provide a valid internal CSE import secret or enable CSE_IMPORT_ALLOW_UNPROTECTED_READS.');
}

export function cseImportAccessGuard(req: Request, res: Response, next: NextFunction): void {
  if (env.CSE_IMPORT_ALLOW_UNPROTECTED_MANUAL_RUN || hasValidImportSecret(req)) {
    next();
    return;
  }

  denyCseImportAccess(res, 'CSE import access denied. Provide a valid internal CSE import secret or enable CSE_IMPORT_ALLOW_UNPROTECTED_MANUAL_RUN.');
}
