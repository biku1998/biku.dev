---
title: "A Cache Miss Is a Bug"
description: "An agent re-sends its whole conversation on every turn, so prompt caching decides most of what it costs. A miss throws no error, it just makes the bill bigger. How caching works on the Claude API, the silent changes that break it, how to keep a prompt append-only, and a small tool that tells you exactly where your cache broke."
pubDate: 2026-11-22
tags: ["engineering", "ai", "agents"]
draft: false
image: "/blog-posters/One.png"
---

Prompt caching is the one bug that never shows up in your error logs.

The request succeeds. The answer is fine. Your tests pass. The only symptom is a bill several times bigger than it should be, and nobody notices it for weeks.

In his Stanford CS146S lecture, [*How always-on agents work*](https://www.youtube.com/watch?v=L1OBRtfPS34), Lee Robinson put it plainly: "if there's a cache miss, it's kind of like a bug in the system, really."

I've mentioned caching in my last two posts: [why files are friendly to the prompt cache](/blog/files-are-all-you-need), and [why swapping tools between turns breaks it](/blog/pick-tools-before-the-turn). This post is the one they both pointed at. How caching actually works, what breaks it, how to build prompts that don't, and a small tool that tells you exactly where your cache broke.

## Why agents live and die by the cache

A chatbot sends one message and gets one reply. An agent sends the *whole conversation* on every turn: the tools, the system prompt, every message and tool result so far, plus the one new thing that just happened.

Lee described it this way: "you're sending it a conversation and then you're doing a change. You're adding one more message. And then you're basically resending the entire conversation over again."

So almost all of an agent's input is a repeat of the last request. Manus [reported](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus) an input-to-output ratio of about 100 to 1 for their agent, and called the KV-cache hit rate "the single most important metric for a production-stage AI agent."

Prompt caching is what makes the repeat cheap. When it works, you pay full price only for the new tail. When it doesn't, you pay for the entire conversation, again, on every turn.

Lee also explained why this got so much attention this year. When OpenClaw took off in January and people ran it all day on their model subscriptions, "this was a very new usage pattern that model providers hadn't really seen, and the harness hadn't really yet been optimized for this type of workflow. So, there was a lot of cache misses." Agents that run all the time turn a small caching mistake into a large, permanent cost.

## How prompt caching works on the Claude API

Everything follows from one rule: **the cache is a prefix match.**

The API renders your request in a fixed order: `tools`, then `system`, then `messages`. When you mark a point with `cache_control`, it stores the rendered prompt up to that point. On the next request, if the prompt up to that point is *byte-for-byte* the same, it reads from cache instead of processing it again.

Any difference, even one character, means everything after it is processed again. A change in `tools` misses the whole prompt. A change in `system` misses the system prompt and every message after it. A change in message 3 misses message 3 onwards.

The details that matter, from Anthropic's [prompt caching docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching):

- **Breakpoints.** Up to 4 `cache_control` markers per request. Or set `cache_control` at the top level of the request, and the API places the breakpoint on the last cacheable block for you and moves it forward as the conversation grows.
- **Lifetime.** 5 minutes by default, refreshed for free every time it's read. A 1-hour option costs more to write.
- **Minimum size.** 512 tokens on the newest models. Shorter prompts silently don't cache: no error, just no cache.
- **Lookback.** Each breakpoint looks back at most 20 blocks for an earlier entry. A single turn that adds more than that can skip past the last cache write and miss.
- **Scope.** Caches are per model, and isolated per workspace on the Claude API. Switching models always starts cold.

And the prices. For Claude Opus 5.5, from the same page:

| | Price per million tokens |
|---|---|
| Normal input | $4.00 |
| Cache write (5-minute) | $5.00 |
| Cache write (1-hour) | $8.00 |
| **Cache read** | **$0.20** |
| Output | $20.00 |

A cache read costs 5% of a normal input token on Opus 5.5. Writing costs 25% *more* than normal input. So the cache pays for itself on the second request, and every request after that is nearly free on the repeated part.

## What a miss actually costs

Take one agent session on Claude Opus 5.5. The tools and system prompt are 30,000 tokens. Each turn adds 2,000 tokens of new input (the user's message, tool results) and 500 tokens of output. Fifty turns later, the prompt is 155,000 tokens long.

| | Cost of the session |
|---|---|
| Every turn hits the cache | **$2.06** |
| Every turn misses | **$23.81** |

That's 11.6 times more, for exactly the same work, the same answers and the same output. The output cost is identical in both rows. All of the difference is re-reading a conversation the model has already seen.

Zoom in on a single request late in the session, with a 100,000-token prompt:

- **Hit:** read 98,000 tokens from cache and write the 2,000 new ones: **$0.03**.
- **Miss:** write all 100,000 tokens again: **$0.50**.

Seventeen times more, on one request, because of something you can't see in the response. And misses are slower too: processing 100,000 tokens from scratch takes longer than reading them from cache, so the user waits longer for the first word.

That's why Lee's framing is right. A miss isn't a performance tweak you might get round to. It's a defect.

## The silent invalidators

Here's what breaks caches in real code. Every one of these looks harmless in a code review.

| What you did | Where it breaks | The fix |
|---|---|---|
| Put the date, time or a request ID in the system prompt | Every request has a new system prompt | Keep `system` frozen. Put changing values in the newest message. |
| Built tools from a `Set`, a map or a database query | Tool order changes between requests | Sort tools by name, every time. |
| Serialized JSON schemas without a stable key order | Same tool, different bytes | Serialize deterministically, with sorted keys. |
| Added or removed tools mid-conversation | Tools render first, so the whole prompt misses | Declare every tool up front. Use `tool_addition` / `tool_removal`. |
| Edited an earlier message, like a reminder injected and then deleted next turn | Everything from that message on | Treat history as append-only. Never rewrite what you already sent. |
| Changed `system` mid-session to switch modes | Every message after the system prompt | Append a `role: "system"` message instead. |
| Switched model mid-conversation | Everything. Caches are per model. | Keep one model per conversation. Use a sub-agent for cheaper side tasks. |
| Changed thinking or effort settings between turns | The messages cache, and on some models more | Pin them per route, not per request. |
| Ran an A/B test that inserts a new prompt section in the middle | Everyone after the inserted section, in every variant | Give sections a fixed order. Experiments go last. |
| Let the conversation sit idle past the TTL | The whole entry expires | Use the 1-hour TTL for long gaps, or re-warm before it expires. |

Most of these share one root cause: **something changed *in front of* content that was already cached.** The cure is the same each time. Stop editing the past. Only ever add to the end.

## Append-only, in practice

Here are the tools to keep a long-running prompt append-only.

**Mid-conversation system messages.** On recent Claude models, you can append a `{"role": "system", ...}` message *inside* `messages` instead of editing the top-level `system` field. The new instruction applies from that point on, and the [cached prefix stays intact](https://platform.claude.com/docs/en/build-with-claude/mid-conversation-system-messages). Mode switches ("you're in read-only mode now"), updated context, today's date: they all go here.

**Tool additions and removals.** Declare every tool on the first request, marking the ones you'll offer later with `defer_loading: true`. Then add or withdraw them with `tool_addition` and `tool_removal` blocks in a system message. The `tools` array never changes, so the cache survives. This is in beta. I used it in the [Jev post](/blog/pick-tools-before-the-turn) to add tools a classifier picked, without breaking the cache.

**Turn-scoped reminders.** The classic per-turn reminder ("remember to keep replies short") gets injected into one request and removed from the next. That removal is a history edit. Instead, append a system message with `clear_at: "next_user_message"` (beta). It shows for one turn, then stays in the transcript, hidden and free, without changing the prefix.

**Compact while the cache is warm.** Every long-running agent eventually summarizes its history. Summarizing means reading the whole conversation one more time. Lee's advice is to do it *while the cache is still warm*: "while you're still within the warm cache period, you should probably do the compaction right now because... it's going to be much cheaper." Read 100,000 cached tokens at $0.20 per million instead of processing them cold at $4. When the user comes back in 30 minutes, they start from a short summary.

**Give prompt sections a fixed order.** Lee described this one as "a fun trick": "even if you deploy a new change where you want to test out some new change to the system prompt or add a new tool, you can almost hash each section and always keep a fixed order." The point is that an experiment shouldn't move anyone else's prompt around:

```js
// Every section has a fixed slot. Experiments only ever add to the end.
const CORE = ["identity", "capabilities", "style", "safety"];

export function buildSystem(sections, experiments = []) {
  const core = CORE.map((id) => sections[id]);
  const extra = [...experiments].sort().map((id) => sections[id]);
  return [...core, ...extra].join("\n\n");
}
```

Users not in an experiment get byte-identical prompts. Users in one share a prefix with everyone up to the end of the core sections. Nobody's cache breaks because someone else's test started.

**Warm the cache before you need it.** Lee's last trick: "when you open the chat and you start typing, the server can actually go and prepare the prompt early... almost like if you're on a website and you go to hover on a link, it can go and pre-fetch the next page." On the Claude API, a request with `max_tokens: 0` [does exactly this](https://platform.claude.com/docs/en/build-with-claude/prompt-caching). It processes the prompt, writes the cache, and returns without generating anything. Fire one when the user starts typing, and their first real message hits a warm cache.

## Finding the bug

Because a miss throws no error, you have to go looking. There are three ways, from cheapest to most precise.

### 1. Read the usage fields

Every response tells you what happened:

- `cache_read_input_tokens`: tokens served from cache
- `cache_creation_input_tokens`: tokens written to cache this request
- `input_tokens`: tokens processed at full price, after the last breakpoint

In a healthy agent loop, reads grow every turn, and writes stay small (roughly the last reply plus the new input). If writes are close to the full conversation size on every turn, something in front of your breakpoint is changing.

### 2. Ask the API

[Cache diagnostics](https://platform.claude.com/docs/en/build-with-claude/cache-diagnostics) does the comparison for you. Send `diagnostics: { previous_message_id: null }` on the first request, then the previous response's `id` on every request after that. When the cache misses, the response says where the two requests diverged: `model_changed`, `system_changed`, `tools_changed` or `messages_changed`, with an estimate of how many tokens the miss cost.

It only reports the *first* divergence, and it needs the `diagnostics` object on every request, but it's the fastest way to find a cache bug in production.

### 3. Diff the payloads

If you log your request bodies, you can find the break yourself. Take two consecutive requests. Everything in the first one should appear, unchanged, at the start of the second. The first place it doesn't is your bug.

Here's a small script that does exactly that. No dependencies, just Node:

```js
#!/usr/bin/env node
// Usage: node cache-diff.mjs previous-request.json next-request.json
// Finds the first place where the next request stops repeating the previous one.
import { readFileSync } from "node:fs";

const [prevPath, nextPath] = process.argv.slice(2);
const load = (p) => stripCacheControl(JSON.parse(readFileSync(p, "utf8")));
const prev = load(prevPath);
const next = load(nextPath);

// cache_control markers move every turn. They aren't part of the prefix.
function stripCacheControl(value) {
  if (Array.isArray(value)) return value.map(stripCacheControl);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "cache_control")
        .map(([key, v]) => [key, stripCacheControl(v)]),
    );
  }
  return value;
}

// Show where two serialized values first differ, with a little context.
function firstDifference(a, b) {
  const x = JSON.stringify(a) ?? "undefined";
  const y = JSON.stringify(b) ?? "undefined";
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  const from = Math.max(0, i - 30);
  return `    before: …${x.slice(from, i + 40)}…\n    after:  …${y.slice(from, i + 40)}…`;
}

function report(where, a, b, why) {
  console.log(`CACHE MISS at ${where}: ${why}`);
  console.log(firstDifference(a, b));
  process.exit(1);
}

// The prompt renders in this order: tools, then system, then messages.
// Model and the settings rendered into the prompt come first, because a change there misses everything.
if (prev.model !== next.model) report("model", prev.model, next.model, "caches are per model");

for (const key of ["thinking", "tool_choice", "output_config"]) {
  if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) {
    console.log(`warning: ${key} changed. Depending on the model, this can invalidate part or all of the cache.`);
  }
}

const prevTools = prev.tools ?? [];
const nextTools = next.tools ?? [];
for (let i = 0; i < Math.max(prevTools.length, nextTools.length); i++) {
  if (JSON.stringify(prevTools[i]) !== JSON.stringify(nextTools[i])) {
    report(`tools[${i}]`, prevTools[i], nextTools[i], "tools render first, so this misses the whole prompt");
  }
}

if (JSON.stringify(prev.system) !== JSON.stringify(next.system)) {
  report("system", prev.system, next.system, "everything after the tools misses");
}

const prevMessages = prev.messages ?? [];
const nextMessages = next.messages ?? [];
for (let i = 0; i < prevMessages.length; i++) {
  if (i >= nextMessages.length) {
    report(`messages[${i}]`, prevMessages[i], undefined, "history was truncated, not appended to");
  }
  if (JSON.stringify(prevMessages[i]) !== JSON.stringify(nextMessages[i])) {
    report(`messages[${i}] (${prevMessages[i].role})`, prevMessages[i], nextMessages[i], "an earlier message was edited, removed or reordered");
  }
}

console.log(`OK: the previous request is an exact prefix. ${nextMessages.length - prevMessages.length} message(s) appended.`);
```

Two details matter. It removes `cache_control` markers before comparing, because the marker moves forward every turn and that isn't a change to the prompt. And it compares the parts in the order the API renders them, so the first difference it reports is the one that actually broke the cache.

I ran it on six pairs of requests for a small support agent: one clean, append-only pair, and five pairs with a common mistake each. The real output:

```text
=== 1-clean
OK: the previous request is an exact prefix. 2 message(s) appended.
(exit 0)
=== 2-timestamp
CACHE MISS at system: everything after the tools misses
    before: …Cart. Today is 2026-11-22T10:41:07Z."}]…
    after:  …Cart. Today is 2026-11-22T10:43:52Z."}]…
(exit 1)
=== 3-tool-order
CACHE MISS at tools[0]: tools render first, so this misses the whole prompt
    before: …{"name":"cancel_order","description":"Cancel an o…
    after:  …{"name":"get_order","description":"Look up an ord…
(exit 1)
=== 4-schema-keys
CACHE MISS at tools[0]: tools render first, so this misses the whole prompt
    before: …el an order","input_schema":{"type":"object","properties":{"order_id":…
    after:  …el an order","input_schema":{"required":["order_id"],"type":"object","…
(exit 1)
=== 5-reminder-deleted
CACHE MISS at messages[0] (user): an earlier message was edited, removed or reordered
    before: …"text":"Cancel my last order"},{"type":"text","text":"<reminder>Keep r…
    after:  …"text":"Cancel my last order"}]}…
(exit 1)
=== 6-model-switch
CACHE MISS at model: caches are per model
    before: …"claude-opus-5-5"…
    after:  …"claude-sonnet-5-5"…
(exit 1)
```

Five bugs, five exact locations. The schema case is my favourite: the tool didn't change at all, only the order of the keys in its JSON schema, and it still breaks the cache for the whole prompt.

### Then make it a test

Caching rarely breaks on day one. It breaks three months later, when someone adds a timestamp to the system prompt to "help the model with dates", or upgrades a library that serializes JSON differently. Anthropic's [troubleshooting list](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) even warns that some languages, like Swift and Go, randomize key order when converting to JSON.

So treat it like any other regression. Run the payload diff over two consecutive requests from your agent in CI, and fail the build on a miss. It needs no API calls, because it only compares the request bodies your code builds. In production, chart `cache_read_input_tokens` as a share of total input, and alert when it drops.

## When a miss is fine

Not every miss is a bug. Some are the cost of doing something useful:

- **The first request** in any conversation, or after the cache expires. Someone has to write it.
- **Compaction.** Replacing the history with a summary starts a new prefix by design. Do it while the old one is still warm, and accept the one cold write after.
- **Switching models between conversations,** not in the middle of one.
- **Prompts under the minimum.** Below 512 tokens on the newest models, there's nothing to cache.
- **Prefixes nobody repeats.** If a prompt is genuinely different every time, don't mark it. You'd pay the 25% write premium and never read it back.

The rule isn't "never miss." It's "never miss *by accident*." Every miss should be one you chose.

## A checklist

1. **Freeze the system prompt.** No dates, IDs, user names or flags in it. Put changing values in the newest message.
2. **Sort your tools,** and serialize their schemas with stable key order.
3. **Declare every tool up front.** Change availability with `tool_addition` / `tool_removal`, never by editing `tools`.
4. **Never edit sent history.** Append system messages instead of rewriting, and use turn-scoped reminders instead of deleting them.
5. **One model per conversation.** Send cheaper side tasks to a sub-agent.
6. **Pin thinking and effort per route,** not per request.
7. **Give prompt sections a fixed order.** Experiments go at the end.
8. **Compact while the cache is warm,** and pre-warm with `max_tokens: 0` when you know a request is coming.
9. **Watch the usage fields.** Track the share of input that's read from cache, and alert when it drops.
10. **Test for it.** Diff consecutive request payloads in CI, and turn on cache diagnostics in production.

## Where this is heading

Lee's point about prompt caching was that there's "a whole art and science" to it, made of "tons and tons of little engineering optimizations that compound." That's the right way to think about it. No single trick is impressive. A frozen system prompt, sorted tools, an append-only history and a compaction timed to the cache window each look small. Together they're the difference between an agent that costs $2 a session and one that costs $24.

As agents run longer, this only matters more. An agent that works for a week doesn't send one big prompt. It sends thousands of nearly identical ones. Whether each of those is a cheap read or a full-price rewrite is decided by a dozen small choices in how you build the prompt.

So treat it like a bug. Measure it, test for it, and fix it when it breaks. Your users will never see the difference. Your bill will.
