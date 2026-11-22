---
title: "Pick the Tools Before the Turn: Using a Classifier to Fix Tool Bloat"
description: "Every MCP server you connect makes your agent a little worse at picking tools. Tool search fixes the context problem but makes the model guess search terms. A fast classifier like TypeSafe's Jev can make that call before the turn starts, without breaking the prompt cache. How it works, the numbers so far, a TypeScript implementation, and where it breaks."
pubDate: 2026-11-22
tags: ["engineering", "ai", "agents"]
draft: false
image: "/blog-posters/Two.png"
---

Connect GitHub, Slack, Sentry, Grafana and Splunk to your agent, and it has spent about 55,000 tokens before the user says hello. That's [Anthropic's own estimate](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool) for tool definitions alone. The same page has a worse number: Claude's ability to pick the right tool "degrades once you exceed 30–50 available tools."

So every integration you add makes the agent a little worse at using all the others.

In his Stanford CS146S lecture, [*How always-on agents work*](https://www.youtube.com/watch?v=L1OBRtfPS34), Lee Robinson described the problem as filling up the model's working memory: "if you just jam every single tool possible into that context window, you're not going to have a lot of space." Grok Bot, the agent he works on at SpaceX, has "a whole system of plugins," so the problem is very real for them.

His answer was a trick that, in his words, "a lot of the more popular harnesses now use": tool search. Only the tool names go in every prompt, and the model looks up the full definition when it needs one.

That works. But it leaves the model doing a job it isn't especially good at: guessing search terms for tools it can't see yet. This post is about a different way to make that decision, before the turn even starts, with a model that's built for exactly this kind of question.

## Three ways to give an agent tools

### 1. Load everything

The default. Every tool definition goes into every request.

The obvious cost is context. The less obvious cost is accuracy: with 200 tools on the table, the model has to pick one out of 200, and it gets that wrong more often than it would with 10.

The cost you might expect, money, is mostly gone if you use prompt caching. 55,000 tokens of tool definitions read from cache cost about a cent per request on Claude Opus 5.5. Tool bloat is now a quality problem more than a billing problem.

### 2. Swap the tool list every turn

The natural fix: work out which tools this request needs, and only send those.

This is the one to avoid. On the Claude API, tools are rendered at the very start of the prompt, before the system prompt and the conversation. Prompt caching matches on the prefix, so changing the tools array changes the first bytes of the prompt and [invalidates the entire cache](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-use-with-prompt-caching). Every turn that swaps tools pays full price for the whole conversation again.

If your agent runs all day, that's the most expensive mistake you can make. (It's also why "a cache miss is a bug" is on my list of posts to write.)

### 3. Let the model search

This is what Lee described, and what Anthropic ships as the [tool search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool). You send every tool definition, but mark most of them `defer_loading: true`. The deferred ones stay out of the prompt. When Claude needs something, it searches with either a regex or a BM25 query over tool names, descriptions and argument names, gets back up to five matches by default, and the API appends those definitions to the conversation.

Appending matters. The definitions arrive inline, after everything already cached, so the prefix never changes. Anthropic says this typically cuts the tool-definition tokens by over 85%.

The cost is that the model now has to know what to search for. It writes a regex or a query for a tool it hasn't seen, based on your system prompt's hint about which categories exist. Anthropic's tips for this section are telling: use consistent prefixes like `github_` so one search matches a group, and "add common keywords to tool descriptions to improve discoverability." That's SEO for tools.

It also spends a step of the model's turn, and the output tokens for the search, on every request that needs a tool it doesn't already have.

## A fourth way: decide before the turn

Look at the question tool search is answering: *given this message, which of these 40 integrations are relevant?*

That's not a generation problem. It's a classification problem, with a closed set of answers. You don't need a frontier LLM to write a regex for it. You need something that reads the message and the list and returns probabilities, quickly and cheaply, before the main model starts.

That's what TypeSafe AI's [Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) is built for. TypeSafe launched it on September 15, 2026 as the first "System One model", named after Kahneman's fast, intuitive System 1. Their description is "a frontier-intelligence function call: unstructured state in, typed probabilistic decisions out."

Jev doesn't generate text. You send it some state and a set of typed questions, and it answers each one with probabilities:

- **Choice**: pick one of up to 255 named options. Returns the winner, a confidence, and a probability for every option.
- **Noul**: a yes/no question. Returns the probability of yes.
- **Score**: a rating on a rubric of up to 10 levels.
- **Box**: locate something in an image (newer, and still marked experimental).

Here's what TypeSafe says about speed and price, from their [launch post](https://typesafe.ai/blog/introducing-system-one-models-and-jev) and [models page](https://docs.typesafe.ai/models.md):

- **70–500 ms** end to end, versus seconds for a frontier LLM call.
- **$0.042 per million input tokens.** Output tokens are free.
- **Calibrated probabilities**: "higher confidence means higher accuracy," so a threshold like 0.8 means the same thing from one question to the next.
- **64k tokens per request** by default, 32k for the state plus any single question.

Treat those as the company's numbers. TypeSafe itself says its published speed evals "are generally run from our laptops on the West Coast," and on price, "We can't prove it isn't subsidized." It's also not alone: OpenAI launched a competing [Decisions API](https://fortune.com/2026/10/08/jev-an-ai-for-making-quick-decisions-has-been-a-viral-hit-in-silicon-valley-but-openai-is-hot-on-its-heels/) three weeks later, at $0.10 per million input tokens. Fast classifiers next to your LLM are becoming a category, not a one-off product.

## Does it actually pick the right tools?

The best evidence so far is TypeSafe's own [skill suggestion cookbook](https://docs.typesafe.ai/cookbooks/skill_suggestion.md). It's close to the tool problem: an agent has 194 skills (from [NousResearch's Hermes agent](https://github.com/NousResearch/hermes-agent)), and on each turn it has to decide which one to load, if any. The agent sees the whole skill index, with each description cut to 60 characters.

Their setup:

- **Call 1** asks Jev a Choice question across all 194 skills, plus a few yes/no questions about whether the request needs a skill at all ("Could a knowledgeable generalist fully satisfy this request in prose, with no tools…").
- **Call 2** re-ranks the top three, this time with the first 700 characters of each skill's instructions, and asks one yes/no question per candidate: does this skill do what the user asked?
- **The result** is at most one skill name, or "no skill applies". It's added to the prompt as a short hint, and the agent decides whether to follow it.

They tested it on 452 requests with Claude Haiku 4.5 as the agent:

| | Wrong skill loaded | Skill loaded when none was needed |
|---|---|---|
| Agent alone | 15.7% | 14.0% |
| Agent + Jev's suggestion | 7.9% | 5.2% |
| Agent told the right answer | 3.2% | 4.1% |

Half the wrong loads and about a third of the needless ones, from two calls that took around 0.1–0.25 seconds each in their run.

The caveats matter, and TypeSafe lists them honestly. These are their numbers, from their cookbook. The test requests were written by Claude Sonnet 5 from each skill's own documentation, and the cookbook admits they're "easier than the ones users send." The suggestion fixed 29 requests and broke 7: "a confident wrong suggestion pulls the agent off its own right answer." And Haiku is a small model. A bigger agent probably makes fewer mistakes on its own, which leaves less for the classifier to fix.

So this isn't proof. It's a promising result on a fair-but-friendly benchmark.

The design detail I like most is how the suggestion reaches the agent. It's not a change to the skill list. It's a small block of text appended *after* the cached index, so the prefix stays the same, and it says "Ignore this if it does not fit what the user actually asked for." The classifier advises. The agent still decides.

## Build it

Here's the same idea for tools, in TypeScript, using TypeSafe's SDK and the Anthropic SDK. It's a sketch, but it typechecks against both SDKs, and the decision logic has tests.

### The plugin catalog

A Jev Choice question takes at most 255 options, and you'll often have more tools than that. So classify by plugin first. A plugin is a group of related tools with one line describing what it's for:

```ts
export type Plugin = {
  // One line on what the plugin is for. Jev reads this, so write it like a label, not marketing.
  description: string;
  tools: BetaTool[];
};

export const plugins: Record<string, Plugin> = {
  github: {
    description: "Code hosting: repositories, pull requests, issues, CI runs.",
    tools: [/* github_list_prs, github_get_issue, ... */],
  },
  calendar: {
    description: "The user's calendar: events, meetings, availability, scheduling.",
    tools: [/* ... */],
  },
  stripe: {
    description: "Billing: customers, invoices, subscriptions, refunds.",
    tools: [/* ... */],
  },
};
```

This is the same trick Grok Bot's plugins and Anthropic's `github_` prefixes point at. A model choosing between 40 plugins does better than one choosing between 400 tools. If one plugin gets huge, add a second Choice inside it.

### The classifier

One Jev request, two questions. A Choice over the plugins, and a yes/no on whether the request needs tools at all. TypeSafe's docs call the second one a [companion Noul](https://docs.typesafe.ai/patterns/companion-noul.md): a Choice question "always picks an option, even when none of them applies," so you ask separately whether any of them does.

```ts
import { choice, noul, TypeSafeClient } from "@typesafe-ai/sdk";

// Pin the version: thresholds you tune against one model shouldn't drift when a new one ships.
const jev = new TypeSafeClient({ defaultModel: "jev-1.14.0" });

export type Pick =
  | { kind: "none" } // no tools needed this turn
  | { kind: "plugins"; plugins: string[] } // load these plugins' tools
  | { kind: "unsure" }; // let the agent search for itself

export async function pickPlugins(request: string, recent: string, plugins: Record<string, Plugin>): Promise<Pick> {
  const criteria = Object.fromEntries(Object.entries(plugins).map(([name, p]) => [name, p.description]));
  if (Object.keys(criteria).length > 255) throw new Error("A Jev choice takes at most 255 options");

  try {
    const { answers } = await jev.systemOne(
      {
        state: { request, recent_context: recent },
        questions: {
          plugin: choice("Which of these integrations does the assistant need for the user's latest request?", criteria),
          needsTools: noul(
            "Does the assistant need to act on the user's accounts, files or services for this request, " +
              "rather than only answer from what it already knows?",
          ),
        },
      },
      // In the request path, a late answer is worse than no answer.
      { timeout: 1_500, retry: { maxRetries: 0 } },
    );
    return decide(answers.needsTools.noul, answers.plugin.probabilities);
  } catch {
    return { kind: "unsure" };
  }
}
```

Two things there are deliberate. The timeout is short and there are no retries, because this call sits in front of every turn. And any failure returns `"unsure"`, not an error. If Jev is slow or down, the agent falls back to searching on its own, which is exactly what it would have done without Jev.

The decision is a pure function, so you can test it without calling anything:

```ts
// Starting thresholds from TypeSafe's routing guides. Tune them on your own traffic.
export function decide(needsTools: number, probabilities: Record<string, number>): Pick {
  if (needsTools < 0.3) return { kind: "none" };
  const likely = Object.entries(probabilities)
    .filter(([, p]) => p >= 0.25)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2)
    .map(([name]) => name);
  if (needsTools < 0.7 || likely.length === 0) return { kind: "unsure" };
  return { kind: "plugins", plugins: likely };
}
```

Three outcomes. Below 0.3, the request almost certainly needs no tools. Above 0.7, with at least one plugin at 0.25 or more, load up to two plugins. Anything in between is "unsure", and the agent keeps searching for itself.

The 0.3 and 0.7 bands come from TypeSafe's [companion Noul guide](https://docs.typesafe.ai/patterns/companion-noul.md). Their [routing guide](https://docs.typesafe.ai/patterns/probability-routing.md) recommends thresholding on an option's probability rather than the Choice's confidence, which is why `decide` reads `probabilities`. The exact numbers are a starting point. Tune them on your own traffic.

### Adding tools without breaking the cache

Now the part that makes this work on the Claude API. You can't change the tools array, because that throws away the cache. So declare every tool once, all deferred, and never touch the array again. When Jev picks a plugin, announce its tools with a [`tool_addition`](https://platform.claude.com/docs/en/build-with-claude/preserved-thinking/change-tools-or-instructions) block in a system message appended after the user's message:

```ts
// Declared once, every tool deferred, never edited. This array is byte-identical all session.
const tools: BetaToolUnion[] = [
  { type: "tool_search_tool_bm25_20251119", name: "tool_search_tool_bm25" },
  ...Object.values(plugins).flatMap((p) => p.tools.map((t) => ({ ...t, defer_loading: true }))),
];

const messages: BetaMessageParam[] = [];
const loaded = new Set<string>();

export async function turn(userText: string) {
  const recent = lastAssistantText(messages);
  messages.push({ role: "user", content: userText });

  const pick = await pickPlugins(userText, recent, plugins);
  if (pick.kind === "plugins") {
    const fresh = pick.plugins.flatMap((name) => plugins[name].tools).filter((t) => !loaded.has(t.name));
    if (fresh.length > 0) {
      // Appended after the user message, so the cached prefix in front of it doesn't change.
      messages.push({
        role: "system",
        content: fresh.map((t) => ({ type: "tool_addition" as const, tool: { type: "tool_reference" as const, name: t.name } })),
      });
      fresh.forEach((t) => loaded.add(t.name));
    }
  }

  const response = await claude.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["mid-conversation-tool-changes-2026-07-01", "server-side-fallback-2026-07-01"],
    fallbacks: "default",
    cache_control: { type: "ephemeral" },
    system: "You help the user with their work. You can search for tools for GitHub, the calendar and billing.",
    tools,
    messages,
  });
  messages.push({ role: "assistant", content: response.content });
  return response; // Run any tool_use blocks in your usual loop.
}
```

Mid-conversation tool changes are a beta (`mid-conversation-tool-changes-2026-07-01`), available on recent Claude models. Anthropic's guidance draws the line in the same place this post does: tool search is for *discovery*, where Claude finds what it needs by itself, and tool additions are for *control*, where your application decides the tool set has changed. Jev turns the first into the second.

Notice what stays in the tools array: the tool search tool. It's never deferred, so it's always available. Jev handles the common case before the turn. When it's unsure, wrong, or the task drifts halfway through a tool loop, the agent can still search for anything else. The classifier is the fast path, not a gate.

### What it costs

A routing call with 40 one-line plugin descriptions and a short message is around a thousand input tokens. At Jev's list price, that's about $0.00004 per turn, or 4 cents per thousand turns. TypeSafe's cookbook measured 0.1–0.25 seconds per call.

The latency is the real cost. It sits in front of every user turn, before the main model can start. A tenth to a quarter of a second is small next to a frontier model's response time, but it isn't zero, and it's on every turn whether the request needed tools or not.

## Where it breaks

**Confident and wrong.** The cookbook's suggestion broke 7 requests that the agent would have got right on its own. If Jev confidently picks the wrong plugin, you've loaded the wrong tools and nudged the agent towards them. Keeping tool search available limits the damage, because the agent can still find the right one. It doesn't remove it.

**It only sees what you send it.** Jev reads the state you give it: here, the latest message and the agent's last reply. "Do the same for the other repo" depends on context three turns back. Send enough recent conversation for the request to make sense on its own, within the 32k-token per-question limit.

**Descriptions are now a model input.** Your plugin descriptions are the options in a classification. Vague ones ("Productivity tools") get vague probabilities. Write them the way you'd write labels for a human sorting tickets. TypeSafe's function-calling guide makes the same point about questions: write them "about the idea rather than the words a user might pick."

**Thresholds are yours to tune.** The 0.3, 0.7 and 0.25 above are starting points, not answers. Log Jev's probabilities next to what the agent actually used, and adjust. Pin the model version while you do, because a new release can move the numbers. Jev 1.14 shipped in October, a month after launch, and `jev-latest` now points to it.

**Another dependency in the request path.** You're adding a second vendor, a second API key and a second outage to every turn. The fallback in `pickPlugins` means an outage costs you the speed-up, not the turn, but that's code you have to write and test.

**The claims are early.** Jev is two months old. Speed, price and calibration figures come from TypeSafe. The best accuracy evidence is TypeSafe's own cookbook on synthetic requests. Run it on a sample of your own traffic before you trust it with real users.

## A checklist

1. **Measure your tool bloat first.** Count tokens in your tool definitions and count tools. Under 10 tools or 10k tokens, you probably don't need any of this.
2. **Never edit the tools array mid-conversation.** Declare everything up front. Change the set with appended additions and removals.
3. **Defer the long tail.** Keep your three to five most-used tools loaded, and defer the rest.
4. **Keep tool search as the fallback.** The classifier handles the common case. Search handles everything it misses.
5. **Group tools into plugins.** It keeps you under 255 options and gives the classifier fewer, clearer choices.
6. **Ask whether any tool is needed, separately.** A Choice question always picks something. A companion yes/no catches the requests that need nothing.
7. **Leave a band for "unsure".** Act on high confidence, skip on low, and let the agent search in the middle.
8. **Fail open, fast.** Short timeout, no retries, and fall back to search on any error.
9. **Pin the classifier version** and re-tune thresholds when you upgrade.
10. **Log decisions next to outcomes.** Which plugins Jev picked, which tools the agent called, and whether the turn worked. That log is your eval set.

## Where this is heading

Lee's advice on how agents should work was to "try the cheapest option or the most reliable option first and kind of work your way up the ladder." He meant it for how an agent finds information: what it already knows, then an API, then the web, then a browser, then the whole desktop.

The same ladder applies to the decisions the agent makes about itself. Which tools does this turn need? Is this shell command safe to run? Should I message the user now, or wait? Many of those are classification questions dressed up as reasoning, and sending each one to a frontier model is the expensive end of the ladder.

The pattern I expect to see more of is a big model that does the thinking, surrounded by small, fast classifiers that make the routine calls before it, cheap enough to run on every turn. Tool selection is the first one worth trying, because the fallback is already built in.

Pick the tools before the turn. Let the model do the rest.
