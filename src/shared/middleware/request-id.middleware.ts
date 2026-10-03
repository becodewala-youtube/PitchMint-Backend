import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { requestContext } from '../utils/request-context';

const REQUEST_ID_HEADER = 'x-request-id';
// Use a conservative validation policy for incoming IDs
// - String value only
// - Maximum length of 128 characters
// - Allow only letters, numbers, periods, underscores, colons, and hyphens
const VALID_ID_REGEX = /^[A-Za-z0-9._:-]{1,128}$/;

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  let requestId = req.headers[REQUEST_ID_HEADER];
  
  if (
    !requestId || 
    typeof requestId !== 'string' || 
    !VALID_ID_REGEX.test(requestId)
  ) {
    requestId = crypto.randomUUID();
  }
  
  res.setHeader(REQUEST_ID_HEADER, requestId);
  (req as any).requestId = requestId;
  
  requestContext.run(requestId as string, () => {
    next();
  });
};
