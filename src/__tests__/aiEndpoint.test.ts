// @vitest-environment node
/**
 * api/ai.ts (the Vercel function) with the Anthropic client mocked: no real API call is ever made.
 * Guards (method, same origin, key, rate limit, sizes, Supabase token), the request sent to Claude, the
 * parsed output, refusals and typed errors.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ create: vi.fn(), ctor: [] as unknown[] }));
vi.mock('@anthropic-ai/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@anthropic-ai/sdk')>();
  const Real = actual.default;
  class MockAnthropic extends Real {
    constructor(opts: ConstructorParameters<typeof Real>[0]) {
      super(opts);
      h.ctor.push(opts);
      (this as unknown as { beta: unknown }).beta = { messages: { create: h.create } };
    }
  }
  return { ...actual, default: MockAnthropic };
});

import Anthropic from '@anthropic-ai/sdk';
import handler, { handleAiRequest, AiHttpRequest, RateLimiter, originAllowed, LIMITS, MODEL } from '../../api/ai';

const KEY = 'sk-ant-test-key-never-shown';
const env = { ANTHROPIC_API_KEY: KEY };
const HOST = 'sarmaya.vercel.app';
const headers = (extra: Record<string, string> = {}) => ({ host: HOST, origin: `https://${HOST}`, 'content-type': 'application/json', ...extra });
const req = (body: unknown, extra: Partial<AiHttpRequest> = {}): AiHttpRequest => ({ method: 'POST', headers: headers(), body, ip: '1.2.3.4', ...extra });
const askBody = { task: 'ask', question: 'Haji Karim ka kitna udhaar hai?', context: { shop: 'Madina', customers: [{ id: 'c1', name: 'Haji Karim', owes: 9600 }] } };
const message = (text: string, extra: Record<string, unknown> = {}) => ({ id: 'msg_1', type: 'message', role: 'assistant', model: MODEL, content: [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text }], stop_reason: 'end_turn', stop_details: null, usage: { input_tokens: 10, output_tokens: 10 }, ...extra });
const deps = (over: Record<string, unknown> = {}) => ({ env, limiter: new RateLimiter(100, 60_000), ...over });

beforeEach(() => {
  h.create.mockReset();
  h.ctor.length = 0;
});

describe('api/ai guards', () => {
  it('missing ANTHROPIC_API_KEY → 503 "AI is not set up yet", Claude never called', async () => {
    const r = await handleAiRequest(req(askBody), deps({ env: {} }));
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ ok: false, code: 'not_configured', error: 'AI is not set up yet' });
    expect(h.create).not.toHaveBeenCalled();
  });

  it('only POST', async () => {
    const r = await handleAiRequest(req(askBody, { method: 'GET' }), deps());
    expect(r.status).toBe(405);
  });

  it('a request from another site (or with no Origin / Referer) is rejected', async () => {
    const evil = await handleAiRequest(req(askBody, { headers: headers({ origin: 'https://evil.example' }) }), deps());
    expect(evil.status).toBe(403);
    expect(evil.body.code).toBe('origin');
    const none = await handleAiRequest(req(askBody, { headers: { host: HOST } }), deps());
    expect(none.status).toBe(403);
    const cross = await handleAiRequest(req(askBody, { headers: headers({ 'sec-fetch-site': 'cross-site' }) }), deps());
    expect(cross.status).toBe(403);
    expect(h.create).not.toHaveBeenCalled();
    // The Referer is used when there is no Origin; x-forwarded-host is the deployment host behind Vercel's proxy.
    expect(originAllowed({ host: 'internal', 'x-forwarded-host': HOST, referer: `https://${HOST}/customers` })).toBe(true);
    expect(originAllowed({ host: HOST, referer: 'https://evil.example/x' })).toBe(false);
    expect(originAllowed({ host: 'localhost:3000', origin: 'http://localhost:3000' })).toBe(true);
    expect(originAllowed({ host: HOST, origin: 'https://preview.example' }, { AI_ALLOWED_HOSTS: 'preview.example' })).toBe(true);
  });

  it('per-IP rate limit', async () => {
    h.create.mockResolvedValue(message(JSON.stringify({ answer: 'ok', open: null })));
    const limiter = new RateLimiter(2, 60_000);
    const d = deps({ limiter });
    expect((await handleAiRequest(req(askBody), d)).status).toBe(200);
    expect((await handleAiRequest(req(askBody), d)).status).toBe(200);
    const third = await handleAiRequest(req(askBody), d);
    expect(third.status).toBe(429);
    expect(third.body.code).toBe('rate_limited');
    // Another IP is not affected.
    expect((await handleAiRequest(req(askBody, { ip: '5.6.7.8' }), d)).status).toBe(200);
    // The window passes.
    expect(limiter.take('1.2.3.4', Date.now() + 61_000)).toBe(true);
  });

  it('caps input size', async () => {
    const longQ = await handleAiRequest(req({ ...askBody, question: 'x'.repeat(LIMITS.questionChars + 1) }), deps());
    expect(longQ.status).toBe(400);
    const bigCtx = await handleAiRequest(req({ ...askBody, context: { blob: 'x'.repeat(LIMITS.askContextChars) } }), deps());
    expect(bigCtx.status).toBe(413);
    const bigImg = await handleAiRequest(req({ task: 'bill', image: { mediaType: 'image/jpeg', data: 'A'.repeat(LIMITS.imageBase64Chars + 10) }, catalog: { customers: [], products: [] } }), deps());
    expect(bigImg.status).toBe(413);
    const huge = await handleAiRequest(req({ task: 'ask', pad: 'x'.repeat(LIMITS.bodyChars) }), deps());
    expect(huge.status).toBe(413);
    const unknown = await handleAiRequest(req({ task: 'hack' }), deps());
    expect(unknown.status).toBe(400);
    expect(h.create).not.toHaveBeenCalled();
  });

  it('checks the Supabase token when one is sent; can require sign-in', async () => {
    h.create.mockResolvedValue(message(JSON.stringify({ answer: 'ok', open: null })));
    const verifyToken = vi.fn(async (t: string) => (t === 'good' ? ('ok' as const) : ('invalid' as const)));
    const bad = await handleAiRequest(req(askBody, { headers: headers({ authorization: 'Bearer nope' }) }), deps({ verifyToken }));
    expect(bad.status).toBe(401);
    const good = await handleAiRequest(req(askBody, { headers: headers({ authorization: 'Bearer good' }) }), deps({ verifyToken }));
    expect(good.status).toBe(200);
    expect(verifyToken).toHaveBeenCalledWith('good', env);
    const noToken = await handleAiRequest(req(askBody), deps({ verifyToken, env: { ...env, AI_REQUIRE_SIGN_IN: 'true' } }));
    expect(noToken.status).toBe(401);
    // Supabase not configured on the server: a token cannot be checked, the request still goes through.
    const unchecked = await handleAiRequest(req(askBody, { headers: headers({ authorization: 'Bearer x' }) }), deps({ verifyToken: async () => 'unavailable' as const }));
    expect(unchecked.status).toBe(200);
  });
});

describe('api/ai → Claude', () => {
  it('a valid question → the parsed answer; the request uses Opus 5, adaptive thinking, structured output and fallbacks', async () => {
    h.create.mockResolvedValue(message(JSON.stringify({ answer: 'Haji Karim ka udhaar Rs. 9,600 hai.', open: { kind: 'customer', id: 'c1' } })));
    const r = await handleAiRequest(req(askBody), deps());
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, task: 'ask', result: { answer: 'Haji Karim ka udhaar Rs. 9,600 hai.', open: { kind: 'customer', id: 'c1' } } });
    expect(h.ctor[0]).toMatchObject({ apiKey: KEY });
    const params = h.create.mock.calls[0][0];
    expect(params.model).toBe('claude-opus-5');
    expect(params.thinking).toEqual({ type: 'adaptive' });
    expect(params.output_config.format.type).toBe('json_schema');
    expect(params.output_config.format.schema.required).toEqual(['answer', 'open']);
    expect(params.fallbacks).toBe('default');
    expect(params.betas).toContain('server-side-fallback-2026-07-01');
    expect(params.max_tokens).toBeLessThanOrEqual(12_000);
    expect(params.messages[0].content[0].text).toContain('<shop_data>');
    expect(params.messages[0].content[0].text).toContain('Haji Karim ka kitna udhaar hai?');
    expect(JSON.stringify(r.body)).not.toContain(KEY);
  });

  it('bill from a photo: image + catalog sent, lines come back', async () => {
    const out = { customerId: 'c1', customerNameGuess: 'Haji Karim', lines: [{ productId: 'p1', nameAsWritten: 'Dalda 16L', qty: 2, unit: 'base', rate: null, confidence: 0.9 }], notes: '' };
    h.create.mockResolvedValue(message(JSON.stringify(out)));
    const r = await handleAiRequest(req({ task: 'bill', text: '2 Dalda', image: { mediaType: 'image/jpeg', data: 'aGVsbG8=' }, catalog: { customers: [{ id: 'c1', name: 'Haji Karim' }], products: [{ id: 'p1', name: '16 L Tin Dalda', unit: 'tin', price: 7000 }] } }), deps());
    expect(r.status).toBe(200);
    expect(r.body.result).toEqual(out);
    const content = h.create.mock.calls[0][0].messages[0].content;
    expect(content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'aGVsbG8=' } });
    expect(content[1].text).toContain('<catalog>');
    expect(content[1].text).toContain('<order>');
  });

  it('reminder and summary tasks', async () => {
    h.create.mockResolvedValueOnce(message(JSON.stringify({ message: 'Assalam-o-Alaikum Haji sahib' })));
    const rem = await handleAiRequest(req({ task: 'reminder', language: 'roman', facts: { customer: 'Haji Karim', amountDue: 9600 } }), deps());
    expect(rem.body.result).toEqual({ message: 'Assalam-o-Alaikum Haji sahib' });
    const badLang = await handleAiRequest(req({ task: 'reminder', language: 'french', facts: {} }), deps());
    expect(badLang.status).toBe(400);
    h.create.mockResolvedValueOnce(message(JSON.stringify({ headline: 'Good day', bullets: ['Sales Rs. 10,200'] })));
    const sum = await handleAiRequest(req({ task: 'summary', period: 'week', context: { sales: 1 } }), deps());
    expect(sum.body.result).toEqual({ headline: 'Good day', bullets: ['Sales Rs. 10,200'] });
  });

  it('refusal, cut-off and unreadable output', async () => {
    h.create.mockResolvedValueOnce(message('', { stop_reason: 'refusal', stop_details: { type: 'refusal', category: null, explanation: null }, content: [] }));
    expect((await handleAiRequest(req(askBody), deps())).body.code).toBe('refused');
    h.create.mockResolvedValueOnce(message('{"answer": "cut', { stop_reason: 'max_tokens' }));
    expect((await handleAiRequest(req(askBody), deps())).body.code).toBe('cut_off');
    h.create.mockResolvedValueOnce(message('not json'));
    const bad = await handleAiRequest(req(askBody), deps());
    expect(bad.status).toBe(502);
    expect(bad.body.code).toBe('bad_output');
  });

  it('typed SDK errors become friendly messages, and the key is never logged', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.create.mockRejectedValueOnce(new Anthropic.RateLimitError(429, { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }, 'slow down', new Headers()));
    const busy = await handleAiRequest(req(askBody), deps());
    expect(busy.status).toBe(429);
    expect(busy.body.code).toBe('busy');
    h.create.mockRejectedValueOnce(new Anthropic.AuthenticationError(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 'invalid x-api-key', new Headers()));
    const key = await handleAiRequest(req(askBody), deps());
    expect(key.status).toBe(503);
    expect(key.body.code).toBe('bad_key');
    h.create.mockRejectedValueOnce(new Anthropic.APIConnectionTimeoutError({ message: 'timeout' }));
    expect((await handleAiRequest(req(askBody), deps())).body.code).toBe('timeout');
    const logged = log.mock.calls.flat().join(' ');
    expect(logged).not.toContain(KEY);
    log.mockRestore();
  });
});

describe('api/ai default export (Node request / response)', () => {
  it('writes JSON with no-store, and 503 when the key is missing', async () => {
    const before = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const out: { status?: number; headers: Record<string, string>; body?: string } = { headers: {} };
    const res = {
      set statusCode(v: number) { out.status = v; },
      setHeader: (k: string, v: string) => { out.headers[k.toLowerCase()] = v; },
      end: (b: string) => { out.body = b; },
    };
    await handler({ method: 'POST', headers: headers(), body: askBody, socket: { remoteAddress: '9.9.9.9' } } as never, res as never);
    expect(out.status).toBe(503);
    expect(out.headers['cache-control']).toBe('no-store');
    expect(JSON.parse(out.body!)).toMatchObject({ code: 'not_configured', error: 'AI is not set up yet' });
    if (before !== undefined) process.env.ANTHROPIC_API_KEY = before;
  });
});
