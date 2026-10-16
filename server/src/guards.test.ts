import type express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireLocalOrRemote } from './guards.js';
import { createPairing, initRemoteStore, setPairingAllowed } from './remote.js';

/** A request from `addr` (through the waiter on this machine when `via` is given), with headers. */
function request(addr: string, headers: Record<string, string> = {}, via?: string) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    socket: { remoteAddress: via ?? addr },
    headers: { ...lower, ...(via ? { 'x-forwarded-for': addr } : {}) },
    get: (name: string) => lower[name.toLowerCase()],
  } as unknown as express.Request;
}
function run(req: express.Request) {
  const res: { status: (code: number) => unknown; json: () => unknown } & Record<string, unknown> =
    {
      status: vi.fn((_code: number) => res),
      json: vi.fn(() => res),
    };
  const next = vi.fn();
  requireLocalOrRemote('documents')(req, res as unknown as express.Response, next);
  return {
    passed: next.mock.calls.length === 1,
    status: (res.status as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as number | undefined,
  };
}

beforeEach(() => initRemoteStore({ file: null, persist: false }));
afterEach(() => initRemoteStore({ file: null, persist: false }));

describe('the documents read by a speaker remote (1.18.0-beta.7)', () => {
  it('this machine reads them; a phone only with its token and «Документи»', () => {
    expect(run(request('127.0.0.1')).passed).toBe(true);
    // a phone through the waiter on 4747: the last hop is the phone
    const phone = '192.168.0.50';
    expect(run(request(phone, {}, '127.0.0.1'))).toEqual({ passed: false, status: 403 });
    const p = createPairing('Доповідач', ['next', 'prev', 'blank']);
    expect(run(request(phone, { 'X-VO-Remote': p.token }, '127.0.0.1')).status).toBe(403);
    setPairingAllowed(p.id, ['next', 'prev', 'blank', 'documents']);
    expect(run(request(phone, { 'X-VO-Remote': p.token }, '127.0.0.1')).passed).toBe(true);
    // a wrong token, or a phone posing as the operator with a forged hop, gets nothing
    expect(run(request(phone, { 'X-VO-Remote': 'not-a-token-at-all' }, '127.0.0.1')).status).toBe(
      403,
    );
    expect(run(request(phone, { 'X-Forwarded-For': '127.0.0.1' })).status).toBe(403);
  });
});
