// kompress-ultra: 4-role living context layer (Composer, Pruner, Rewriter, Circulator)
import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import {
  type KompressUltraOptions,
  DEFAULT_OPTIONS,
  type Message,
  type SystemContext,
  type KompressStats,
  isCircuitOpen,
  recordSuccess,
  recordFailure,
  computeDensity,
  adaptiveThreshold,
  scoreMessageSync,
  isProtected,
  ebbinghausDecay,
  structuralBoost,
  compressMessage,
  CompressionLevel,
  buildKompressDisplay,
  readBrainState,
  buildBrainLine,
  writeCompactionStats,
  classifyMessage,
  escalateForBudget,
  DEFAULT_BUDGETS,
} from "../../packages/kompress-ultra/src/index.js";

// Re-exports for middleware consumers (score.test.ts, integration.test.ts, litellm-hook.ts)
export {
  isProtected,
  scoreMessage,
  ebbinghausDecay,
  structuralBoost,
  compressMessage,
  CompressionLevel,
  isCircuitOpen,
  computeDensity,
  adaptiveThreshold,
  buildKompressDisplay,
  readBrainState,
  buildBrainLine,
  fetchHonchoPatterns,
  classifyMessage,
  escalateForBudget,
};

// Optional embedding, Honcho, digest and circulation networking is disabled.
// The upstream transport does not enforce literal loopback, redirect refusal,
// or proxy isolation. Keep scoring synchronous until a request-scoped secure
// transport can be injected; endpoint environment variables cannot opt around it.
async function scoreMessage(message: Message, index: number, total: number, _taskGoal?: string) {
  return scoreMessageSync(message, index, total);
}

async function fetchHonchoPatterns(_url: string, _topic: string): Promise<string[]> {
  return [];
}

// ─── Plugin State ───────────────────────────────────────────────────────────

const state = {
  lastCompactionAt: 0,
  contextSizeHistory: [] as number[],
  cachedPatterns: [] as string[],
  lastPatternFetch: 0,
  lastStatusBannerAt: 0,
  bannerInterval: null as ReturnType<typeof setInterval> | null,
};

// ─── Plugin ─────────────────────────────────────────────────────────────────

const createContextHooks = (_input: PluginInput, options?: KompressUltraOptions) => {
  const mergedOpts = { ...DEFAULT_OPTIONS, ...options };

  // Periodic Status Banner
  const BANNER_INTERVAL_MS = 5 * 60 * 1000;

  if (state.bannerInterval) clearInterval(state.bannerInterval);
  state.lastStatusBannerAt = Date.now();
  state.bannerInterval = setInterval(async () => {
    const now = Date.now();
    if (now - state.lastStatusBannerAt < BANNER_INTERVAL_MS) return;
    state.lastStatusBannerAt = now;

    const brainState = await readBrainState();
    const brainLine = brainState ? buildBrainLine(brainState) : "❓ BRAIN UNKNOWN";
    const historyLen = state.contextSizeHistory.length;
    const avgSize =
      historyLen > 0
        ? Math.round(state.contextSizeHistory.reduce((a, b) => a + b, 0) / historyLen)
        : 0;

    const lines = [
      "─── kompress status ───",
      brainLine,
      `patterns cached: ${state.cachedPatterns.length}`,
      `context history: ${historyLen} snapshots, avg ${avgSize} msg`,
      `circuit breaker: ${isCircuitOpen() ? "OPEN" : "closed"}`,
      "───────────────────────",
    ];
    console.log(lines.join("\n"));
  }, BANNER_INTERVAL_MS);
  state.bannerInterval.unref?.();

  return {
    // messages.transform: Pruner + Rewriter + Circulator
    "experimental.chat.messages.transform": async (input: unknown, _output: unknown) => {
      const ctx = input as SystemContext;
      const messages = ctx.messages ?? [];
      if (messages.length <= mergedOpts.maxMessagesKept) return;

      const density = computeDensity(messages);
      const threshold = mergedOpts.adaptiveThreshold
        ? adaptiveThreshold(density, mergedOpts.relevanceThreshold)
        : mergedOpts.relevanceThreshold;

      // PRUNER: Score all messages
      const scored = await Promise.all(
        messages.map(async (msg, idx) => ({
          msg,
          idx,
          score: await scoreMessage(msg, idx, messages.length, ctx.taskGoal),
        })),
      );

      // PRUNER: Split by safety floors + threshold
      const kept: Message[] = [];
      const dropped: Message[] = [];
      for (const s of scored) {
        if (s.score.protected || s.score.total >= threshold) kept.push(s.msg);
        else dropped.push(s.msg);
      }

      // Safety: 50% prune cap
      const maxPrune = Math.floor(messages.length * 0.5);
      if (dropped.length > maxPrune) {
        const excess = dropped.length - maxPrune;
        kept.push(...dropped.slice(0, excess));
        dropped.splice(0, excess);
      }

      // Drop weakest until under cap
      let final = kept;
      if (kept.length > mergedOpts.maxMessagesKept) {
        final = kept
          .sort((a, b) => {
            const sa = scored.find((s) => s.msg === a)?.score.total ?? 0;
            const sb = scored.find((s) => s.msg === b)?.score.total ?? 0;
            return sa - sb;
          })
          .slice(-mergedOpts.maxMessagesKept);
      }

      // Safety: empty context guard
      if (final.length === 0) return;

      // REWRITER: Compress by age
      const rewritten = final.map((msg, i) => {
        const age = final.length - i;
        if (age <= 5) return msg;
        if (age <= 15) return { ...msg, content: compressMessage(msg.content, CompressionLevel.Lite) };
        return { ...msg, content: compressMessage(msg.content, CompressionLevel.Ultra) };
      });

      // Token budget escalation
      const agentType = (ctx as Record<string, unknown>).agent_type as string || "orchestrator";
      const budget = Object.prototype.hasOwnProperty.call(DEFAULT_BUDGETS, agentType)
        ? DEFAULT_BUDGETS[agentType as keyof typeof DEFAULT_BUDGETS]
        : DEFAULT_BUDGETS.orchestrator;
      const budgeted = escalateForBudget(rewritten, budget);

      const prunedCount = messages.length - budgeted.length;

      // Update context
      if (prunedCount > 0) {
        state.contextSizeHistory.push(messages.length);
        if (state.contextSizeHistory.length > 10) {
          state.contextSizeHistory = state.contextSizeHistory.slice(-10);
        }

        const model = (ctx as Record<string, unknown>).model as string || "unknown";
        const tokensPruned = dropped.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
        const tokensKept = budgeted.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
        const kompressStats: KompressStats = {
          model,
          pruned: prunedCount,
          kept: budgeted.length,
          total: messages.length,
          threshold,
          density,
          history: [...state.contextSizeHistory],
          tokensPruned,
          tokensKept,
        };
        const kompressDisplay = buildKompressDisplay(kompressStats, mergedOpts.transparencyMode);

        const brainState = await readBrainState();
        if (brainState) {
          kompressDisplay.content += `\n${buildBrainLine(brainState)}`;
        }

        (ctx as { messages: Message[] }).messages = [kompressDisplay, ...budgeted];

        await writeCompactionStats(mergedOpts.mempalaceDb, prunedCount, budgeted.length);


      }
    },

    // system.transform: Composer
    "experimental.chat.system.transform": async (input: unknown, _output: unknown) => {
      const ctx = input as SystemContext;
      const now = Date.now();

      if (isCircuitOpen()) {
        const staleLine = "❓ BRAIN STALE (circuit breaker open)";
        ctx.systemPrompt = (ctx.systemPrompt ?? "") + "\n\n" + staleLine;
        return;
      }

      if (now - state.lastPatternFetch > mergedOpts.pollIntervalMs) {
        const topic = ctx.taskGoal ?? ctx.messages?.[0]?.content?.slice(0, 100) ?? "general";
        try {
          state.cachedPatterns = await fetchHonchoPatterns(mergedOpts.milvusUrl, topic);
          recordSuccess();
        } catch {
          recordFailure();
          state.cachedPatterns = [];
        }
        state.lastPatternFetch = now;
      }

      const density = computeDensity(ctx.messages ?? []);
      const activeThreshold = mergedOpts.adaptiveThreshold
        ? adaptiveThreshold(density, mergedOpts.relevanceThreshold)
        : mergedOpts.relevanceThreshold;

      const brainState = await readBrainState();
      let brainLine = "";
      if (brainState) {
        brainLine = buildBrainLine(brainState);
      }

      const kompressBlock = [
        `## kompress auto-pruning | threshold ${activeThreshold.toFixed(2)} | density ${density.toFixed(2)} | max-kept ${mergedOpts.maxMessagesKept} msg`,
        brainLine,
      ].filter(Boolean);

      if (state.cachedPatterns.length > 0) {
        kompressBlock.push("", "## honcho patterns");
        state.cachedPatterns.forEach((p) => kompressBlock.push(`- ${p}`));
      }

      ctx.systemPrompt = (ctx.systemPrompt ?? "") + "\n\n" + kompressBlock.join("\n");
    },

    "experimental.compaction.autocontinue": async (input: unknown, _output: unknown) => {
      const ctx = input as { messages?: Message[]; [key: string]: unknown };
      const messages = ctx.messages ?? [];
      const now = Date.now();

      if (now - state.lastCompactionAt < mergedOpts.pollIntervalMs) return;
      if (messages.length < mergedOpts.maxMessagesKept) return;

      state.lastCompactionAt = now;

      return { action: "compaction.trigger", reason: "context_limit_near" };
    },
  };
};

// OpenCode supplies records in the mutable second argument. Retain its IDs,
// part metadata, protected history and chronology around the text adapter.
export default async (input: PluginInput, options?: KompressUltraOptions): Promise<Hooks> => {
  const hooks = createContextHooks(input, options);
  return {
    "experimental.chat.messages.transform": async (_input, output) => {
      const original = output.messages;
      const contexts: Message[] = original.map((entry, index) => ({
        role: entry.info.role,
        content: entry.parts.filter(part => part.type === "text").map(part => part.text).join("\n"),
        type: entry.parts.length === 1 && entry.parts[0].type === "text"
          && !entry.parts[0].ignored && !entry.parts[0].synthetic ? undefined : "error",
        entryIndex: index,
      }));
      const ctx: SystemContext = { messages: contexts };
      await hooks["experimental.chat.messages.transform"](ctx, {});
      const transformed = new Map(ctx.messages
        .filter(message => Number.isInteger(message.entryIndex))
        .map(message => [message.entryIndex as number, message]));
      const keep = new Set(transformed.keys());
      contexts.forEach((message, index) => {
        if (isProtected(message, index, contexts.length)) keep.add(index);
      });
      const minimum = original.length - Math.floor(original.length / 2);
      for (let index = original.length - 1; keep.size < minimum && index >= 0; index--) keep.add(index);
      output.messages = original.flatMap((entry, index) => {
        if (!keep.has(index)) return [];
        const rewritten = transformed.get(index);
        if (!rewritten || isProtected(contexts[index], index, contexts.length)) return [entry];
        return [{ ...entry, parts: entry.parts.map(part => part.type === "text"
          ? { ...part, text: rewritten.content } : part) }];
      });
    },
    "experimental.chat.system.transform": async (input, output) => {
      const ctx: SystemContext = { messages: [], session_id: input.sessionID, systemPrompt: "" };
      await hooks["experimental.chat.system.transform"](ctx, {});
      if (ctx.systemPrompt) output.system.push(ctx.systemPrompt.trim());
    },
  };
};
