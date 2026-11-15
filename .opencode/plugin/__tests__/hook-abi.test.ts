import { afterEach, describe, expect, test } from "bun:test";
import type { PluginInput } from "@opencode-ai/plugin";
import plugin, { scoreMessage, fetchHonchoPatterns } from "../kompress-ultra";

const originalFetch = globalThis.fetch;
const originalEndpoint = process.env.OVHCLOUD_EMBEDDING_URL;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalEndpoint === undefined) delete process.env.OVHCLOUD_EMBEDDING_URL;
  else process.env.OVHCLOUD_EMBEDDING_URL = originalEndpoint;
});

function entry(index: number, role = "assistant") {
  return {
    info: { id: `message-${index}`, sessionID: "test-session", role },
    parts: [{ id: `part-${index}`, type: "text", text: `Basically, this is a verbose explanation for message ${index}. In order to help you, I would be happy to provide some details.` }],
  };
}

describe("OpenCode hook ABI", () => {
  test("messages are transformed through output while protected records and order survive", async () => {
    globalThis.fetch = (() => { throw new Error("Unexpected network access"); }) as typeof fetch;
    delete process.env.OVHCLOUD_EMBEDDING_URL;
    const hooks = await plugin({} as PluginInput, { maxMessagesKept: 10, relevanceThreshold: 1, droppedMessageDigest: false });
    const original = Array.from({ length: 60 }, (_, index) => entry(index));
    original[0] = entry(0, "user");
    original[1].parts = [{ id: "tool-part", type: "tool", text: "tool metadata" }];
    original[2].parts[0].text = "```rust\nfn main() {}\n```";
    const output = { messages: structuredClone(original) };
    await hooks["experimental.chat.messages.transform"]!({}, output as never);
    expect(output.messages.length).toBeLessThan(original.length);
    expect(output.messages.length).toBeGreaterThanOrEqual(30);
    for (const index of [0, 1, 2, 55, 56, 57, 58, 59]) {
      expect(output.messages.find(item => item.info.id === original[index].info.id)).toEqual(original[index]);
    }
    const ids = output.messages.map(item => Number(item.info.id.split("-")[1]));
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    for (const item of output.messages) expect(item.parts[0].id).toBe(original[Number(item.info.id.split("-")[1])].parts[0].id);
  });

  test("system hook appends to output and blocks default or external embeddings", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (url: unknown) => {
      calls.push(String(url));
      return new Response("{}", { status: 503 });
    }) as typeof fetch;
    process.env.OVHCLOUD_EMBEDDING_URL = "https://outside.example/embeddings";
    const hooks = await plugin({} as PluginInput);
    const output = { system: ["Original system instruction"] };
    await hooks["experimental.chat.system.transform"]!({ sessionID: "test-session", model: {} } as never, output);
    await scoreMessage({ role: "assistant", content: "private context" }, 0, 20, "private goal");
    expect(output.system[0]).toBe("Original system instruction");
    expect(output.system.length).toBeGreaterThan(1);
    expect(calls).toEqual([]);
  });
  test("optional network paths remain disabled for every endpoint configuration", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (url: unknown) => {
      calls.push(String(url));
      return new Response(null, { status: 302, headers: { location: "https://outside.example/collect" } });
    }) as typeof fetch;
    for (const endpoint of ["http://127.0.0.1:18080", "http://[::1]:18080", "http://localhost:18080", "https://outside.example"]) {
      process.env.OVHCLOUD_EMBEDDING_URL = endpoint;
      await scoreMessage({ role: "assistant", content: "private context" }, 0, 60, "private goal");
      expect(await fetchHonchoPatterns(endpoint, "private topic")).toEqual([]);
      const hooks = await plugin({} as PluginInput, {
        maxMessagesKept: 10, relevanceThreshold: 1,
        droppedMessageDigest: true, milvusUrl: endpoint, pollIntervalMs: 0,
      });
      const output = { messages: Array.from({ length: 60 }, (_, index) => entry(index)) };
      await hooks["experimental.chat.messages.transform"]!({}, output as never);
      expect(output.messages.length).toBeLessThan(60);
      await hooks["experimental.chat.system.transform"]!({ sessionID: "test-session", model: {} } as never, { system: [] });
    }
    // No transport is invoked, so redirects and ambient proxies cannot send
    // private context away from this wrapper.
    expect(calls).toEqual([]);
  });

});
