// Inference is restricted to an explicitly literal loopback endpoint.
export interface LLMResponse {
  content: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
}

export function localEndpoint(raw: string): string | null {
  if (!/^http:\/\/(?:127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?\/?$/.test(raw)) return null;
  try {
    return new URL('/api/chat', raw).href;
  } catch {
    return null;
  }
}

export async function askLocal(prompt: string, model: string, maxTokens: number): Promise<LLMResponse | null> {
  const endpoint = localEndpoint(process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434');
  if (!endpoint || !model || !Number.isSafeInteger(maxTokens) || maxTokens < 1) return null;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      redirect: 'error',
      proxy: '', // Bun: disable environment proxy routing for literal loopback.
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: false,
        think: false, options: { num_predict: maxTokens, temperature: 0 } }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) return null;
    const json = await response.json() as {
      message?: { content?: string }; eval_count?: number; prompt_eval_count?: number;
    };
    const content = json.message?.content?.trim();
    if (!content) return null;
    return { content, model: `local/${model}`, tokens_in: json.prompt_eval_count ?? 0,
      tokens_out: json.eval_count ?? 0 };
  } catch {
    return null;
  }
}

export async function ask(prompt: string, model: string, _key: string, _hfToken: string, maxTokens: number): Promise<LLMResponse | null> {
  return model.startsWith('local/') ? askLocal(prompt, model.slice(6), maxTokens) : null;
}

// Compatibility exports fail closed. Keys never authorize hosted inference.
export async function askOpenRouter(_prompt: string, _model: string, _key: string, _maxTokens: number): Promise<LLMResponse | null> { return null; }
export async function askHF(_prompt: string, _model: string, _token: string, _maxTokens: number): Promise<LLMResponse | null> { return null; }
export async function askVaked(_prompt: string, _model: string, _maxTokens: number): Promise<LLMResponse | null> { return null; }
export const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
