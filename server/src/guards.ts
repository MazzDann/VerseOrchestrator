import type express from 'express';
import { N_ } from '@vo/shared';
import { isLocalRequest } from './access.js';

/**
 * Guard for routes that change state. Only the operator's machine may write; phones on
 * the LAN are read-only viewers. The custom header forces a CORS preflight (which this
 * server never answers), so a random web page open in the operator's browser can't fire
 * these as "simple" cross-site requests either. Future remote roles (e.g. a speaker
 * remote paired via QR) would extend this check with a token rather than open the LAN.
 */
export const requireLocalControl: express.RequestHandler = (req, res, next) => {
  if (req.get('x-vo-control') !== '1' || !isLocalRequest(req)) {
    res.status(403).json({ error: N_('Керування доступне лише з цього комп’ютера') });
    return;
  }
  next();
};

/** Reads only this machine may make (the remote list, the server's options). */
export const requireLocal: express.RequestHandler = (req, res, next) => {
  if (!isLocalRequest(req)) {
    res.status(403).json({ error: N_('Керування доступне лише з цього комп’ютера') });
    return;
  }
  next();
};
