---
title: "Your AI Agent Keeps Making the Same Mistake. The Prompt Isn't the Fix."
description: "Prompt-tuning can't fix systematic agent failures. Harness engineering, the scaffolding around the model, is where the real leverage is. Same model, 6x performance, and why the engineer's job is shifting."
pubDate: 2026-04-30
tags: ["engineering", "ai", "agents"]
draft: false
image: "/og/harness-engineering.png"
---

Your agent writes an import that breaks the architectural layer your team has spent two years defending.

You ask it to fix a failing test. It turns off the linter rule that flagged the underlying bug.

It declares the task done. You run end-to-end tests. They've never run.

You add a paragraph to your project's instruction file: "follow our coding standards." Next session, same mistake.

I've been watching this pattern for months across my own work, agents I've built, and teams I'm close to. The instinct is always the same: rewrite the prompt. Add a sentence. Be more specific. It happens again.

Here's the uncomfortable part: prompts can't fix this.

## The system around the prompt is doing the actual work

Telling an agent "follow our coding standards" is fundamentally different from wiring a linter that blocks the PR when standards are violated.

The first asks for probabilistic compliance: "please be careful." The second is a deterministic constraint: the agent literally cannot ship code that violates the rule.

This distinction has been crystallizing into a real engineering discipline over the past few months. Mitchell Hashimoto named it in February in [his post on adopting AI](https://mitchellh.com/writing/my-ai-adoption-journey): **harness engineering**.

> "I've grown to calling this 'harness engineering.' It is the idea that anytime you find an agent makes a mistake, you take the time to engineer a solution such that the agent never makes that mistake again."

The harness is everything around the model: tools, file structures, validation gates, instruction files, automated reviewers, the whole scaffolding that turns an unpredictable model into a reliable contributor. The model is the horse. The harness is the reins. You're the rider. Most teams are still trying to argue with the horse.

## This is not prompt engineering and it's not context engineering

These three are easy to conflate. They operate at different layers:

|             | Prompt Engineering         | Context Engineering     | Harness Engineering                       |
| ----------- | -------------------------- | ----------------------- | ----------------------------------------- |
| **Scope**   | One turn                   | One session             | Across all sessions                       |
| **Lever**   | Wording of the instruction | What goes in the window | Tools, gates, feedback loops              |
| **Fixes**   | Unclear instructions       | Missing or wrong info   | Repeat mistakes, drift, unsafe actions    |

Prompt engineering improves a single response. Context engineering, well covered in Anthropic's writing on [effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), changes what the model can see at any given moment. Harness engineering decides what the model can and cannot do, period. Including what it cannot do wrong.

Anthropic's separate piece on [effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) lands in roughly the same place: as agents become more autonomous, the bottleneck stops being the model and starts being the system around it. Martin Fowler's [taxonomy of guides and sensors](https://martinfowler.com/articles/harness-engineering.html) is the cleanest way I've seen to think about what a harness is actually made of: feedforward controls that steer the agent before it acts, feedback controls that catch it after.

## Same model. Six-times performance

Here's the result that should make every engineering team pay attention.

In [Can.ac's Hashline experiment](https://blog.can.ac/2026/02/12/the-harness-problem/), the only thing that changed was the harness's tool format. Specifically, how the model expresses code edits. No new model. No new prompt. No new context. Grok Code Fast 1 went from **6.7% to 68.3%** on the same coding benchmark. Patch format was the worst for nearly every tested model. A small format change turned a failing model into a competitive one.

[LangChain ran a similar experiment](https://blog.langchain.com/improving-deep-agents-with-harness-engineering/) on Terminal Bench 2.0. They kept GPT-5.2-Codex fixed and changed the harness: context middleware that mapped working directories on startup, time budgeting to push the agent toward verifying instead of endlessly iterating, an explicit reasoning budget tuned for the actual task. They went from outside the top 30 to top 5. A 13.7-point jump on the same model.

The implication is awkward for teams who treat model selection as the most important lever in their AI stack: it isn't. Not even close. The harness is.

## What a harness actually contains

Across the OpenAI report, Anthropic's writing, Hashimoto, and Fowler, the components keep showing up. Four pieces:

### 1) A project instruction file at the root of the repo

CLAUDE.md, AGENTS.md. Same idea under different names. The project's purpose, its structure, the build commands, the conventions, and a growing list of "things this agent has done wrong before." It's not a prompt; it's a contract that loads into every session. You add a line every time the agent makes a mistake worth not repeating.

This is the cheapest, highest-leverage piece of harness work most teams skip.

### 2) Hard architectural constraints

[OpenAI's Codex team](https://openai.com/index/harness-engineering/) described enforcing a strict layered architecture where each domain had rigid dependency rules: code could only import from adjacent layers, enforced by custom linters and structural tests on every PR. No agent could bypass them. No prompt instruction could either.

The principle: if you don't want the agent to do something, the system should make it impossible, not merely discouraged.

### 3) Feedback loops the agent can run itself

Tests, type checkers, linters, CI: all exposed in a way the agent can invoke before declaring a task done. The pattern that keeps showing up: agents are surprisingly good at fixing their own mistakes when they can verify them, and surprisingly bad when they can't. The harness's job is to make verification cheap and the answer unambiguous.

### 4) Cleanup agents that fight entropy

The harness isn't only about preventing initial mistakes. It actively fights drift, running periodically to find inconsistencies in documentation, violations of architectural constraints, dead code paths that snuck in across sessions. This is the most underrated piece. Without it, every harness gradually decays as the codebase moves underneath it.

## A million lines, three engineers, no humans writing code

The most cited proof point for this discipline came from OpenAI's own Codex team in February.

Per [their report](https://openai.com/index/harness-engineering/), they started from an empty repository in late August 2025. Five months later they had shipped on the order of a million lines of production code. Roughly 1,500 PRs merged. A team that started at three engineers and grew to seven. ~3.5 PRs per engineer per day.

Humans never directly contributed code.

The engineers' job was to design the harness. That's the line that's been quoted everywhere since:

> Humans steer. Agents execute.

You can argue with the methodology. You can argue with what counts as "production code." What you can't argue with is the size of the bet OpenAI just publicly placed on the idea that the highest-leverage engineering work in 2026 is not the code itself.

## What happens when you skip the harness

If you need a darker reason to take this seriously, here it is.

[Apiiro's September 2025 analysis](https://apiiro.com/blog/4x-velocity-10x-vulnerabilities-ai-coding-assistants-are-shipping-more-risks/) of AI-generated code across thousands of repositories found more than 10,000 new security findings per month by June 2025, a 10x increase from December 2024. Privilege escalation paths up 322%. Design flaws up 153%. Secrets exposure up 40%.

These are not model failures. They are harness failures. The model wrote code. Nothing in the surrounding system caught the consequences.

[Gartner predicted last June](https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027) that more than 40% of agentic AI projects would be canceled by the end of 2027, citing escalating costs, unclear value, and inadequate risk controls. That last phrase is the one to sit with. "Inadequate risk controls" is just another way of saying "no harness."

The teams that ship will be the ones who treat the harness as a first-class engineering surface. The teams that don't will keep blaming the model.

## What this means for the engineer

There's a temptation, when reading any "the role is changing" essay, to roll your eyes. I get it. But this one is more concrete than most.

The work is shifting from writing code to designing the system that decides how code gets written, validated, and merged. Project instruction files, custom linters, structural tests, feedback gates, sub-agents that review other agents' output. This is the new surface. It's not glamorous. It's also not optional if you want agents doing real work in a real codebase.

A few things I've started doing differently in my own setup:

- My CLAUDE.md and AGENTS.md files are doing more load-bearing work than any prompt I've ever written. Every "the agent did something dumb" moment becomes a line in the file.
- The fastest improvements in agent reliability come from constraints, not from clearer instructions. If a sentence in the prompt didn't work the first time, a louder sentence won't work the second time.
- I've started asking a different question when an agent fails: was the harness too loose? Could I have made the dumb thing impossible instead of just unlikely?

This is the part nobody tells you about working with AI agents seriously: the moment you stop arguing with the model and start engineering the environment, the ceiling on what the agent can do moves up by a factor that's hard to overstate.

The model is the horse. Stop arguing with the horse. Build better reins.
