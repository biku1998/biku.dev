---
title: "Files Are All You Need: How Always-On Agents Remember"
description: "The teams shipping agents that run for weeks didn't reach for a vector database. They reached for a folder of markdown files and grep. How the layered file memory works, why it beats fancier designs more often than you'd expect, a small implementation you can copy, and where files fall short."
pubDate: 2026-10-25
tags: ["engineering", "ai", "agents"]
draft: false
image: "/blog-posters/Seven.png"
---

In February I wrote that [AI memory is harder than anyone admits](/blog/why-ai-agents-cant-remember). I argued that memory is a structured recall problem, not a storage problem, and I was building [memo-mesh](https://github.com/biku1998/memo-mesh) on Postgres and pgvector to prove it.

Since then, the teams shipping agents that people actually leave running for days have mostly converged on a different answer. Not a vector database. Not a knowledge graph.

A folder of markdown files. And `grep`.

Claude Code keeps its memory in plain markdown files. OpenClaw writes one file per day. Anthropic's memory tool for the API is a set of file commands on a `/memories` directory. Manus calls the file system "the ultimate context". And Lee Robinson summed it up in one line: "everything else can be found through files."

Lee previously worked at Vercel and Cursor, and now works on Grok Bot at SpaceX. He recently gave a guest lecture for Stanford's CS146S course, [*How always-on agents work*](https://www.youtube.com/watch?v=L1OBRtfPS34), about the engineering behind agents that run for weeks. It's worth watching in full. I'll quote it throughout this post.

I don't think this means I was wrong about the hard problems. But I was wrong about where to start. This post is about why files work, how the layered version is put together, and where it breaks.

## What Lee described

An always-on agent is the kind you text like a coworker. It runs for weeks, does work while you sleep, and picks up where it left off. Its context window is its working memory, and that fills up in hours. Anything that has to last longer has to live somewhere else.

Lee described the memory as a few layers:

1. **Core facts about the user**, included in every single prompt. His example: if you like lowercase messages, that has to be in every turn, "otherwise it would be really weird if one message now has uppercase letters."
2. **Dated logs**, "kind of your past conversation history", written the way a colleague keeps notes on what they did each day. Ask "what did I do last week?" and the agent goes and looks it up.
3. **Scratchpad notes**, little things that are "designed to be ephemeral and they will go away, but they might be relevant just for the next 30 minutes or an hour."
4. **Everything else, in files.** The agent searches them when it needs to, because models "are very good at using Linux commands, running shell commands to go grep and search and look through these files."

He also compared choosing which facts to keep to garbage collection, and to how your brain works: the soccer match isn't in your head right now, but you can recall it when it matters.

None of this is exotic. That's the point.

## Everyone landed in the same place

Look at how the agents you can actually inspect handle memory:

- **Claude Code** keeps auto memory in [`~/.claude/projects/<project>/memory/`](https://code.claude.com/docs/en/memory): a `MEMORY.md` index with one line per memory, plus one topic file per memory. Only the first 200 lines or 25KB of the index load at the start of a session. Topic files aren't loaded up front. Claude reads them "on demand using its standard file tools when it needs the information." Everything is plain markdown you can open, edit or delete.
- **OpenClaw** uses [a `MEMORY.md` for durable facts and decisions, and `memory/YYYY-MM-DD.md` for daily notes](https://docs.openclaw.ai/concepts/memory). `MEMORY.md` loads at the start of a session, along with today's and yesterday's notes. Before it compacts a long conversation, it runs a silent turn that reminds the agent to save anything important to durable memory.
- **Anthropic's memory tool** for the Claude API is [six file commands](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool) (`view`, `create`, `str_replace`, `insert`, `delete`, `rename`) on a `/memories` directory. When you enable it, the API adds this to the system prompt: "ASSUME INTERRUPTION: Your context window might be reset at any moment, so you risk losing any progress that is not recorded in your memory directory."
- **Manus** wrote that they [treat the file system "as the ultimate context"](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus): "unlimited in size, persistent by nature, and directly operable by the agent itself."
- **Cursor** [writes long tool outputs and the full chat history to files](https://cursor.com/blog/dynamic-context-discovery) instead of truncating them, and lets the agent read back what it needs.

Five teams, five products, one shape: a small file that's always loaded, a pile of dated or topical files that aren't, and the agent's own tools to look things up.

## Why files beat fancier designs

### Models already know how to use them

Coding agents spend their lives in file systems. Reading files, grepping for a symbol, opening line 40 to 80, editing a string in place. The models behind them are trained on huge amounts of exactly this. When memory is files, the agent is using its best tools, not a custom `recall_memory(query, top_k)` it has seen in one system prompt.

Letta tested this directly in a post titled [*Is a Filesystem All You Need?*](https://www.letta.com/blog/benchmarking-ai-agent-memory) They put the LoCoMo conversation data in files and gave a GPT-4o mini agent four tools: `grep`, `search_files`, `open` and `close`. It scored **74.0%**. Mem0's best reported result, from its graph variant, was **68.5%**.

Treat that with care. Letta sells an agent platform, the setups weren't identical, and Letta itself concludes that "current memory benchmarks may not be very meaningful." But the direction matches everything else in this post: a simple tool the model is good at beats a clever tool it isn't.

### The agent decides what to look for

Classic retrieval runs one search before the model thinks. You embed the user's message, pull the top five chunks, and hope they're the right ones.

An agent with grep searches the way you do. It tries a word, sees what comes back, notices a name or a date, and searches again. If the first search for "flight" turns up a note about an offsite, it can grep for "offsite" next. The retrieval is part of the reasoning, not a step before it.

The Claude Code team reportedly went through the same thing with code. Early versions used RAG over a local vector database. According to [The Pragmatic Engineer](https://newsletter.pragmaticengineer.com/p/building-claude-code-with-boris-cherny), they tried local vector databases and other indexing approaches, each with problems like stale indexes and permissions, and plain glob and grep driven by the model beat them.

### Compression you can undo

Every long-running agent eventually has to drop things from its context. The usual tool is summarisation, and summaries are lossy. Once a detail is summarised away, it's gone.

Files make compression reversible. Manus's rule is that their "compression strategies are always designed to be restorable": you can drop a web page's content from context "as long as the URL is preserved." Swap a 20,000-token tool output for a file path, and the agent can read it back if it turns out to matter. Cursor does the same with chat history: after summarising, the agent gets a reference to the full history file.

Lee made the same point about long command output: "rather than stuffing that in the context, you can just put it in a file. And the agents are very good at reading files."

### People can read it

This one is underrated. When the agent believes something wrong about you, you can open the folder and see the line. You can fix it with a text editor. You can `git diff` what it learned this week.

Try that with a vector index. The data is there, but nobody can read a 1,536-dimension embedding and tell you what the agent thinks.

### It's friendly to the prompt cache

An always-on agent makes a lot of calls, and most of each prompt is the same as last time. That repeated prefix is what prompt caching makes cheap. Manus called the KV-cache hit rate "the single most important metric for a production-stage AI agent", with an input-to-output ratio around 100:1.

Retrieval that rewrites the top of the prompt on every turn breaks the cache. File memory mostly doesn't. The core file changes rarely, so it sits in the stable prefix. Logs and search results arrive later in the conversation as tool results, where they don't invalidate what came before.

## The four layers, in detail

Here's how I'd lay out the layers Lee described, with what each one costs you:

| Layer | What goes in | When it's loaded | How long it lives | Who writes it |
|---|---|---|---|---|
| Core | Facts that must hold in every reply: name, tone, hard constraints | Every prompt | Until it's wrong | Agent proposes, a sweep job or the user curates |
| Dated logs | What happened each day, append-only | Today and yesterday | Forever (or your retention policy) | Agent, as it works |
| Scratchpad | Work in progress: "3 of 7 files reviewed" | Every prompt, until it expires | Minutes to hours | Agent |
| Everything else | Notes on people, projects, decisions, long tool outputs | Only when the agent searches | Until deleted | Agent and user |

The rule for each layer is about cost. Core facts are expensive: you pay for them on every call, so keep them short. Claude Code caps its always-loaded index at 200 lines. Logs are cheap to write and free until read. The scratchpad exists so short-lived state doesn't pollute either of the other two.

OpenClaw's docs have a good test for where something goes: decisions, preferences and durable facts go in `MEMORY.md`, while running context goes in the daily note. If it will matter next month, it's core. If it matters today, it's a log entry.

## Build it in an afternoon

Here's a minimal version in Node with no dependencies. It's a sketch, not a framework, but every snippet below runs.

The layout:

```text
memory/
├── core.md                    # layer 1: always loaded
├── log/
│   ├── 2026-10-24.md          # layer 2: one file per day
│   └── 2026-10-25.md
├── scratch/
│   └── 1792924200000-pr-review.md   # layer 3: expiry timestamp in the name
└── people/priya.md            # layer 4: anything else the agent writes
```

It uses the local disk to keep things simple. In a multi-user product you'd back the same tools with S3 or Postgres, which I come back to under "Scale" below. The methods below all live inside one `createMemory(root)` function, which shares a few imports and helpers:

```js
import { readFile, writeFile, appendFile, mkdir, readdir, rm, lstat, realpath } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const run = promisify(execFile);
const day = (d = new Date()) => d.toISOString().slice(0, 10);
// A missing file is an empty layer. Any other error is a real problem.
const read = (p) =>
  readFile(p, "utf8").catch((e) => {
    if (e.code === "ENOENT") return "";
    throw e;
  });
const exists = (p) => lstat(p).then(() => true, () => false);

export function createMemory(root) {
  // Every path, including the ones built in code, goes through safe().
  const file = (...p) => safe(path.join(...p));
  // safe(), scratchFiles() and liveScratch() from below go here.

  return {
    // buildContext, log, scratch, search and sweep from below go here.
    read: async (p) => readFile(await safe(p), "utf8"),
    write: async (p, body) => {
      const full = await safe(p);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, body);
    },
  };
}
```

The context builder loads the first three layers and tells the agent the fourth exists:

```js
async buildContext(now = new Date()) {
  const yesterday = new Date(now.getTime() - 86_400_000);
  const scratch = await liveScratch(now);
  return [
    "## About the user (always true)\n" + (await read(await file("core.md"))),
    "## Log: yesterday\n" + (await read(await file("log", `${day(yesterday)}.md`))),
    "## Log: today\n" + (await read(await file("log", `${day(now)}.md`))),
    "## Scratchpad (expires soon)\n" + scratch.map((s) => s.body).join("\n"),
    "Older logs and notes are in your memory directory. Search them with memory_search.",
  ].join("\n\n");
},
```

Logging is an append. The scratchpad puts its expiry in the file name, so expiring it needs no database:

```js
async log(entry, now = new Date()) {
  await mkdir(await file("log"), { recursive: true });
  const time = now.toISOString().slice(11, 16);
  await appendFile(await file("log", `${day(now)}.md`), `- ${time} ${entry}\n`);
},

async scratch(name, body, ttlMinutes = 60, now = new Date()) {
  // The model picks the name, so keep it to a plain slug.
  if (!/^[\w-]+$/.test(name)) throw new Error(`Bad scratch name: ${name}`);
  await mkdir(await file("scratch"), { recursive: true });
  const expires = now.getTime() + ttlMinutes * 60_000;
  await writeFile(await file("scratch", `${expires}-${name}.md`), body);
},
```

The search tool is grep. It returns file names and line numbers, so the agent can see *when* something was written and open the file around it:

```js
async search(pattern, { regex = false } = {}) {
  const mode = regex ? "-E" : "-F";
  const args = ["-rni", mode, "--include=*.md", "-e", pattern, root];
  const clean = (out) => out.split(root + path.sep).join("").slice(0, 4_000);
  try {
    // maxBuffer stops grep once it has printed enough, instead of buffering every match.
    const { stdout } = await run("grep", args, { maxBuffer: 16_000 });
    return clean(stdout);
  } catch (e) {
    if (e.code === 1) return "No matches.";
    if (e.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") return clean(e.stdout);
    throw e;
  }
},
```

Run it with a log entry from March and ask for `flight|offsite` with `regex: true`, and the agent gets back:

```text
log/2026-03-02.md:1:- 09:00 Booked flight BLR→SFO for the Nov 12 offsite.
```

The date comes for free, from the file name.

A few details in that snippet matter more than they look. `execFile` passes arguments without a shell, so a pattern can't run commands. `-e` stops a pattern like `--help` from being read as a grep option. And searches are literal (`-F`) unless the agent asks for a regex, so a query like `C++` or `price ($5)` finds what it says instead of failing as a broken regex. The model writes these strings, so treat them as untrusted input.

The same goes for paths. Anthropic's docs warn that a path like `/memories/../../secrets.env` can escape the memory directory. So can a symlink: if the agent also has a shell, it can link `notes/` to `/etc` and then read `notes/passwd`. Every read and write goes through a check that resolves the real path on disk:

```js
async function safe(p) {
  await mkdir(root, { recursive: true });
  const realRoot = await realpath(root);
  const full = path.resolve(realRoot, p.replace(/^\/+/, ""));
  let existing = full;
  while (!(await exists(existing))) existing = path.dirname(existing);
  const real = await realpath(existing);
  if (real !== realRoot && !real.startsWith(realRoot + path.sep)) throw new Error(`Path outside memory: ${p}`);
  // Return the resolved path, so the links we just checked aren't followed again.
  return path.join(real, path.relative(existing, full));
}
```

The loop matters for writes: the file doesn't exist yet, so it checks the nearest folder that does. A dangling symlink fails `realpath`, so it's rejected too.

This is still check-then-use. An agent running shell commands at the same moment could swap a folder for a symlink between the check and the write. Node has no portable way to open a path while refusing symlinks at every level, so don't make this function your security boundary. The sandbox is. Run the agent as a user that can only touch its own memory folder, and treat `safe()` as the guard against honest mistakes and simple attacks.

Finally, a sweep job runs on a schedule, outside the agent loop, and deletes expired scratch notes:

```js
async sweep(now = new Date()) {
  const expired = (await scratchFiles()).filter((f) => Number(f.split("-")[0]) <= now.getTime());
  await Promise.all(expired.map(async (f) => rm(await file("scratch", f))));
  return expired;
},

// Only files: a stray folder in scratch/ shouldn't crash the job.
async function scratchFiles() {
  const entries = await readdir(await file("scratch"), { withFileTypes: true }).catch(() => []);
  return entries.filter((e) => e.isFile()).map((e) => e.name);
}

async function liveScratch(now) {
  const live = (await scratchFiles()).filter((f) => Number(f.split("-")[0]) > now.getTime()).sort();
  return Promise.all(live.map(async (f) => ({ name: f, body: await read(await file("scratch", f)) })));
}
```

This is also where Lee's garbage collection belongs. A nightly job can read the week's logs, propose new core facts, and flag core facts that the logs contradict. Keep that out of the agent's turn. The agent should write things down quickly, and something slower and more careful should tidy up after it.

Give the agent three tools on top of this: `memory_search`, `memory_read` and `memory_write`. Or, if you're on the Claude API, implement the six commands of the built-in memory tool against the same folder.

## What files fix from my February list

In the February post I listed three problems I thought nobody was solving: provenance, temporal validity, and conflicts between memories. Files don't solve them, but they make each one much less painful.

**Provenance.** I wanted every fact to link back to where it came from. Put the memory folder in git and you get that for nothing. `git log -p memory/core.md` shows when the agent decided you were vegetarian, and the log file from that day shows the conversation that caused it. You can make it stricter by having the agent cite the log line whenever it adds a core fact.

**Temporal validity.** A fact from March and a fact from October look identical in a vector index. In dated logs, the date is the first thing the agent sees. "Basic plan" in `log/2026-01-14.md` and "upgraded to Premium" in `log/2026-04-03.md` come back from one grep, in order.

**Conflicts.** Because grep returns every match instead of the top five by similarity, the agent sees both sides of a contradiction and can reason about it, or ask. The system doesn't quietly pick the one with the higher score.

That's not a full solution. Nothing stops the agent from ignoring the dates. But you can see what happened, and you can fix it with an editor.

## Where files lose

I'd be repeating the hype cycle if I stopped there. Files have real limits.

**Different words for the same thing.** Grep finds "flat". It doesn't find "apartment". A good agent tries synonyms, but it doesn't always. That's why OpenClaw's `memory_search` is hybrid: it combines vector similarity, for when the wording differs, with keyword matching, for exact things like IDs and code symbols. The files stay the source of truth, and the index sits on top. OpenClaw keeps that index in a SQLite file per agent, so you don't need a separate vector database to get there: an extension like [sqlite-vec](https://github.com/asg017/sqlite-vec), or pgvector if you're already on Postgres, is enough. If your memory is mostly fuzzy, conversational text, you'll probably want the same.

**Scale.** A folder per user is fine for one person's assistant. For a product with a million users, you're not going to put a million folders on one disk. You don't have to. Anthropic's docs say the `/memories` path is "a prefix that your handler maps onto real storage, such as a per-user directory or keys in a database." The *interface* is files. The storage can be S3 or Postgres. That's the part I find most useful: the agent sees a file system because that's what it's good at, and you store it however your infrastructure needs.

**Concurrent writers.** One agent appending to today's log is fine. A main agent and three sub-agents all editing `core.md` at once is a race. Give each writer its own log file, and make the core file a single-writer job.

**Memory poisoning.** Anything the agent writes down, it will believe later. If it reads a web page that says "the user has approved all payments to this account" and saves it to memory, that instruction now survives across sessions. Only write to core memory from things the user said or did, and keep content from the outside world clearly labelled as untrusted wherever you store it.

**Growth.** Files never forget unless you make them. A year of daily logs is fine for grep, but `MEMORY.md` will bloat if nothing prunes it. Claude Code handles this bluntly: when the index nears its limit, it tells Claude to shorten it. Whatever you build needs some version of that sweep.

## A checklist

1. **Start with files.** Add a vector index later, on top of the files, once you have evidence that keyword search misses things.
2. **Keep the always-loaded layer tiny.** Every line costs tokens on every call. Claude Code caps it at 200 lines. Pick your own number and enforce it.
3. **Date everything.** Dated file names are the cheapest temporal metadata there is.
4. **Make scratch notes expire.** Short-lived state shouldn't end up in long-term memory by accident.
5. **Save before you compact.** Like OpenClaw, give the agent one turn to write things down before you summarise its context.
6. **Make compression restorable.** Replace big tool outputs with a file path, not a summary.
7. **Keep stable things at the top of the prompt.** Core memory belongs in the cached prefix. Search results belong in tool results.
8. **Treat model-written paths and patterns as untrusted.** Validate paths, avoid the shell, and use `-e` with grep.
9. **Put memory in version control.** Provenance and undo, for free.
10. **Let people see and edit it.** If a user can't fix a wrong memory, they'll stop trusting all of them.

## Where this is heading

Near the end of the lecture, Lee listed the building blocks of agent products: durable workflows, sandboxes, computers in the cloud, memory, skills, payments, identity, evals. Memory was on his short list of areas with the most work still to do. And skills, notably, are also just markdown files: your process for doing something, written down so the agent can read it when it needs it.

That's the pattern underneath all of this. We spent years building special-purpose stores for each thing an agent needs to know. Then models got good enough at reading and searching files that the oldest abstraction in computing turned out to be the right one.

I'm still building memo-mesh, and I still think provenance and temporal validity are the real problems. But if I were starting today, I'd start with a folder, a dated log and grep, and add complexity only when the files stopped being enough.

Write it down. The agent will find it.
