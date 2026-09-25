/**
 * The browser side of the AI features: POST to the same-origin /api/ai (no URL or key in the app), with the
 * Supabase access token when this device has a session. Every outcome comes back as a value, never a throw.
 */
import type { AiErrorCode, AiResultFor, AiTask } from '../../api/ai';
import { cloudAccessToken } from '../lib/cloudAuth';

export const AI_ENDPOINT = '/api/ai';
export const AI_NOT_SET_UP = 'AI not set up — ask the owner to add the key in Vercel';

export type AiFailureKind = 'not_setup' | 'cancelled' | 'offline' | 'error';
export type AiCallResult<T extends AiTask> = { ok: true; result: AiResultFor<T> } | { ok: false; kind: AiFailureKind; message: string; code?: AiErrorCode | string };

const MESSAGES: Partial<Record<string, string>> = {
  not_configured: AI_NOT_SET_UP,
  rate_limited: 'Too many AI requests from this connection. Wait a few minutes and try again.',
  origin: 'This request was blocked. Open the app from its own address and try again.',
};

export const callAi = async <T extends AiTask>(task: T, payload: Record<string, unknown>, opts: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}): Promise<AiCallResult<T>> => {
  const doFetch = opts.fetchImpl || fetch;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, kind: 'offline', message: 'No internet connection. AI needs the internet; the rest of the app works offline.' };
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = await cloudAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await doFetch(AI_ENDPOINT, { method: 'POST', headers, body: JSON.stringify({ task, ...payload }), signal: opts.signal, credentials: 'same-origin' });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError' || opts.signal?.aborted) return { ok: false, kind: 'cancelled', message: 'Cancelled.' };
    return { ok: false, kind: 'offline', message: 'Could not reach the AI. Check the internet and try again.' };
  }
  let body: Record<string, unknown> | null = null;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }
  if (res.ok && body && body.ok === true && body.result) return { ok: true, result: body.result as AiResultFor<T> };
  const code = typeof body?.code === 'string' ? body.code : undefined;
  // A static host without the function (e.g. a plain preview) answers 404 / an HTML page: same as not set up.
  if (code === 'not_configured' || res.status === 404 || (!body && (res.ok || res.status === 405))) return { ok: false, kind: 'not_setup', message: AI_NOT_SET_UP, code: code || 'not_configured' };
  const message = (code && MESSAGES[code]) || (typeof body?.error === 'string' && body.error) || (res.status === 413 ? 'That is too big to send. Use a smaller photo or a shorter message.' : 'The AI could not answer. Try again.');
  return { ok: false, kind: 'error', message, code };
};
