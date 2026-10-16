import type express from 'express';
import { N_ } from '@vo/shared';
import { isLocalRequest } from './access.js';
import { findByToken, type RemoteCommand } from './remote.js';

/** A request the control window on this machine sent (requireLocalControl lets it through). */
export const isLocalControl = (req: express.Request) =>
  req.get('x-vo-control') === '1' && isLocalRequest(req);

/**
 * Guard for routes that change state. Only the operator's machine may write; phones on
 * the LAN are read-only viewers. The custom header forces a CORS preflight (which this
 * server never answers), so a random web page open in the operator's browser can't fire
 * these as "simple" cross-site requests either. Future remote roles (e.g. a speaker
 * remote paired via QR) would extend this check with a token rather than open the LAN.
 */
export const requireLocalControl: express.RequestHandler = (req, res, next) => {
  if (!isLocalControl(req)) {
    res.status(403).json({ error: N_('Керування доступне лише з цього комп’ютера') });
    return;
  }
  next();
};

/**
 * Reads of the operator's own texts (1.18.0-beta.7: the documents) — this machine, or a speaker
 * remote the operator allowed to read them: its token in `X-VO-Remote` (a header, never in the
 * address), a pairing with `permission`. Anyone else on the LAN gets nothing.
 */
export const requireLocalOrRemote =
  (permission: RemoteCommand): express.RequestHandler =>
  (req, res, next) => {
    if (isLocalRequest(req)) return next();
    const p = findByToken(req.get('x-vo-remote'));
    if (p?.allowed.includes(permission)) return next();
    res.status(403).json({ error: N_('Пульту це не дозволено') });
  };

/** Reads only this machine may make (the remote list, the server's options). */
export const requireLocal: express.RequestHandler = (req, res, next) => {
  if (!isLocalRequest(req)) {
    res.status(403).json({ error: N_('Керування доступне лише з цього комп’ютера') });
    return;
  }
  next();
};
