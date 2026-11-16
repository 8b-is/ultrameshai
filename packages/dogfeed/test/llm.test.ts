import { afterEach, expect, test } from 'bun:test';
import { ask, askHF, askLocal, askOpenRouter, askVaked, localEndpoint } from '../src/llm';
import { DEFAULT_CONFIG } from '../src/types';
const originalFetch = globalThis.fetch;
const originalHost = process.env.OLLAMA_HOST;
afterEach(() => { globalThis.fetch = originalFetch; if (originalHost === undefined) delete process.env.OLLAMA_HOST; else process.env.OLLAMA_HOST = originalHost; });

test('only literal loopback authorities are accepted', () => {
  expect(localEndpoint('http://127.0.0.1:11434')).toBe('http://127.0.0.1:11434/api/chat');
  expect(localEndpoint('http://[::1]:11434/')).toBe('http://[::1]:11434/api/chat');
  for (const raw of ['http://localhost:11434', 'http://2130706433', 'http://127.1', 'http://127.0.0.1.evil', 'http://127.0.0.1@evil', 'http://example.com', 'http://127.0.0.1:99999', 'http://127.0.0.1/path', 'http://127.0.0.1?proxy=evil']) expect(localEndpoint(raw)).toBeNull();
});

test('cloud models and invalid local hosts never connect', async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls++; throw new Error('Unexpected connection'); }) as unknown as typeof fetch;
  for (const model of ['hf/m', 'vaked/m', 'cloud/m']) expect(await ask('p', model, 'k', 't', 5)).toBeNull();
  expect(await askHF('p', 'm', 't', 5)).toBeNull();
  expect(await askOpenRouter('p', 'm', 'k', 5)).toBeNull();
  expect(await askVaked('p', 'm', 5)).toBeNull();
  process.env.OLLAMA_HOST = 'http://example.com';
  expect(await askLocal('p', 'm', 5)).toBeNull();
  expect(calls).toBe(0);
  expect(DEFAULT_CONFIG.models.every(m => m.startsWith('local/'))).toBeTrue();
  expect(DEFAULT_CONFIG.dailyCallLimit).toBeGreaterThan(0);
  expect(DEFAULT_CONFIG.dailyTokenLimit).toBeGreaterThan(0);
});

test('local request disables redirects and proxies and identifies backend', async () => {
  process.env.OLLAMA_HOST = 'http://127.0.0.1:11434';
  globalThis.fetch = (async (_url: unknown, options: RequestInit & { proxy?: string }) => {
    expect(options.redirect).toBe('error'); expect(options.proxy).toBe('');
    expect(JSON.parse(String(options.body)).think).toBeFalse();
    return Response.json({ message: { content: 'fixture' }, eval_count: 2, prompt_eval_count: 3 });
  }) as unknown as typeof fetch;
  expect(await ask('p', 'local/m', '', '', 5)).toEqual({ content: 'fixture', model: 'local/m', tokens_in: 3, tokens_out: 2 });
});

test('real loopback transport ignores proxies and refuses redirects', async () => {
  const saved = process.env.HTTP_PROXY;
  let redirected = 0;
  const target = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => { redirected++; return Response.json({ message: { content: 'redirect target' } }); } });
  let redirect = false;
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => redirect
    ? Response.redirect(`http://127.0.0.1:${target.port}/api/chat`)
    : Response.json({ message: { content: 'local fixture' }, eval_count: 1 }) });
  try {
    process.env.HTTP_PROXY = 'http://127.0.0.1:9';
    process.env.OLLAMA_HOST = `http://127.0.0.1:${server.port}`;
    expect((await askLocal('p', 'fixture', 5))?.content).toBe('local fixture');
    redirect = true;
    expect(await askLocal('p', 'fixture', 5)).toBeNull();
    expect(redirected).toBe(0);
  } finally {
    if (saved === undefined) delete process.env.HTTP_PROXY; else process.env.HTTP_PROXY = saved;
    server.stop(true); target.stop(true);
  }
});
