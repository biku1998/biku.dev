---
title: "AI Made Writing Code Cheap. The Senior Who Reviews It Is Now the Bottleneck."
description: "AI removed code generation as the constraint, and the bottleneck moved downstream to review. What the data says, how teams are responding, and why the person who can tell when the output is wrong is now both the bottleneck and the multiplier."
pubDate: 2026-10-02
tags: ["engineering", "ai", "agents"]
draft: false
image: "/blog-posters/Two.png"
---

It's Monday morning. There are fourteen pull requests waiting for you.

Six of them are over a thousand lines. All of them pass CI. All of them have a tidy, confident description. Most of them were written in an afternoon by someone working with an agent.

You open the first one. The code is clean. The naming is good. The tests are green. And you have no idea whether it's right.

Your team has never shipped more code. You have never been less sure of what's in it.

This has a name now. Some people call it the review crisis, others the AI productivity paradox. Either way it describes the same thing: AI removed code generation as the constraint, and the bottleneck didn't disappear. It moved downstream to verification, and it landed on the senior engineers.

## The bottleneck didn't go away. It moved.

Start with the individual. On well-scoped tasks, controlled studies have measured real speedups. In [GitHub's controlled Copilot experiment](https://arxiv.org/abs/2302.06590), developers with the assistant finished one specific task, writing an HTTP server in JavaScript, 55.8% faster. Google's randomized trial on its own engineers landed around 21%. Results vary by setting, and not every study finds a speedup, but 20 to 55% is the range you'll see quoted for tasks like these.

Then look at what happens once that output hits the team.

Faros AI's [AI Productivity Paradox report](https://www.faros.ai/ai-productivity-paradox) in 2025 looked at telemetry from over 10,000 developers across 1,255 teams. On teams with high AI adoption:

- Developers completed **21% more tasks** and merged **98% more pull requests**.
- The average pull request was **154% larger**.
- PR review time went up **91%**.
- At the company level, there was **no significant correlation** between AI adoption and delivery improvement.

More code, bigger diffs, slower reviews, same outcomes. That was the paradox.

Their [2026 follow-up](https://www.faros.ai/blog/ai-acceleration-whiplash-takeaways), covering 22,000 developers and 4,000+ teams, compares each organization's lowest and highest periods of AI adoption. The review numbers got worse:

- PR size is up another **51.3%**.
- Developers juggle **67.4% more PR contexts** per day.
- Median time in review is up **441.5%**.
- Pull requests merged with **no review at all**, human or agentic, are up **31.3%**.

That last one is what an overwhelmed system looks like. When the queue can't be cleared, people stop queueing.

To be fair to the data, the 2026 report does show delivery finally accelerating: epics completed per developer are up 66%. It also shows bugs up 54% and the incidents-to-PR ratio up 242.7%. Teams are shipping more. The data can't say how much of that a proper review would have caught. My bet is a lot of it.

A team ships safely at the speed of its slowest step. Writing code used to be that step. It isn't anymore, so making it faster doesn't make the team better. It makes the pile in front of the reviewer taller.

## Speed is not velocity

Victor Kaugesaar has the cleanest framing of this I've read, in [Speed is not velocity](https://kaugesaar.se/blog/speed-is-not-velocity):

> "Speed is how quickly code appears on the screen. Velocity is whether the system is actually moving in the right direction."

Speed is a number. Velocity has a direction. Agents gave every team a lot more of the first, and nothing about the second came with it. As he puts it, writing the code was never the only bottleneck, and in many cases not even the main one. The hard part was always deciding what should exist, what shape it should take, and what it will cost you later.

His other point is the one that explains the review queue. Friction was doing us a favour. When code was expensive to write, the cost was a filter. A thousand-line PR used to mean someone had spent days inside the problem, and most half-formed ideas never made it that far. Now starting is free and finishing is as expensive as it ever was. Everything gets started, and all of it arrives at the one place where direction still gets checked.

That place is review. Which is why the reviewer is no longer just checking code. They're the last point in the pipeline where anyone asks whether this is the right thing to be building at all.

Accelerate without improving direction and, in his words, "you just get lost at higher speed."

## Why reviewing AI code costs more than reviewing human code

Volume is only half of it. The other half is what the review itself now demands.

AI-generated code is often almost correct. It's plausible on the surface. It compiles, it reads well, it follows the conventions of the file it's in. And underneath, it can carry a subtle security regression or a quiet bit of architectural drift.

When you review a teammate's code, you can usually reconstruct what they were thinking. You know how they work. You can ask them why, and they'll have an answer.

With agent-written code, the author often can't tell you why a decision was made, because they didn't make it. So the reviewer has to reverse-engineer the intent from the diff. That's a much more expensive kind of reading than checking whether an implementation matches an intent you already understand.

Bigger diffs, more of them, each one harder to read. That's review fatigue, and it's falling on the handful of people in every team who know the system well enough to catch what's wrong.

## Fix one: put agents in front of the reviewer

The first response is the obvious one. If AI created the volume, let AI absorb it. Teams are deploying AI reviewers as a first-pass filter so humans can spend their attention on the things that need it.

A few versions of this are in the wild:

- **Agent teams.** Anthropic's [Code Review for Claude Code](https://claude.com/blog/code-review) dispatches a team of agents on every PR to find bugs in parallel, verify them, and rank them by severity. Internally, the share of PRs getting substantive review comments went from 16% to 54%.
- **Internal builds.** HubSpot built [Sidekick](https://product.hubspot.com/blog/automated-code-review-the-6-month-evolution), a multi-model reviewer that cut the time engineers wait for feedback by 90%. The interesting detail is the judge agent: a quality gate that checks every comment for succinctness, accuracy, and actionability before it's posted, so the signal-to-noise ratio stays high enough for humans to keep reading.
- **Risk-aware automation.** Meta's [RADAR](https://arxiv.org/abs/2605.30208) runs each diff through a layered funnel and auto-reviews the low-risk ones. Across 535,000+ diffs it cut median review wall time by 35%, and the diffs it reviewed were reverted a third as often as the rest.
- **Off-the-shelf tools.** CodeRabbit, Greptile, and Qodo are being adopted for broad coverage and cross-file context.

These help. They don't solve it.

Here's the uncomfortable part: adding a review bot doesn't remove the burden. The bottleneck mutates again. The senior engineer stops being a reviewer of code and becomes a maintainer of the infrastructure that reviews code. Someone has to tune the bots, decide which of their findings matter, and notice when they're confidently wrong. The cognitive load is still there. It just changed shape.

## Fix two: change where judgment happens

The more impactful shifts are in the workflow, not the tooling. Thoughtworks put it bluntly in [The code review is dead; long live the code review](https://www.thoughtworks.com/insights/blog/testing/code-review-dead-long-live-code-review), and a piece on Martin Fowler's site asks whether [we should be reviewing all this code](https://martinfowler.com/rachels-ramblings/code-review.html) at all. Both land on the same idea: if feedback is valuable, move it closer to the decision it's informing. Stop treating the pull request as the place where judgment happens.

### 1) Shift judgment left

Don't wait for the PR. Pairing, mob programming, and team design sessions put the architectural conversation before the code exists. By the time a diff shows up, the decisions that matter have already been made together, and the knowledge has already spread.

### 2) Redefine what the reviewer is for

Senior engineers should stop being reviewers of code and become maintainers of intent and architecture. The questions worth their time are about failure modes, transaction boundaries, and system safety. Not syntax.

### 3) Allocate capacity before buying tools

Often the real problem isn't tooling, it's that senior time is being spent on things that never needed it. Style and basic bugs should be caught by automated checks before a human opens the PR. What's left is the part that needs experience.

### 4) Build merge gates that aren't a person

Some teams are moving away from manual approval as the only gate. Tests, observability, and drift alerts block the merge automatically. Review becomes a strategic checkpoint instead of a line-by-line audit.

### 5) Treat review as planned work

Review capacity is a resource, so plan it like one. Give reviewers designated windows. Stop treating every review request as an emergency. This is how you keep your best people from burning out.

Put together, the split looks like this:

|                | Automate it                           | Elevate it                                         |
| -------------- | ------------------------------------- | -------------------------------------------------- |
| **What**       | Style, syntax, basic bug-catching     | Architectural intent, failure modes, system safety |
| **Who**        | Linters, tests, AI reviewers, gates   | Senior engineers                                   |
| **When**       | Before a human ever opens the PR      | Before the code is written                         |

## The senior who reviews well is the bottleneck and the multiplier

This is the part I keep coming back to.

Everything above reads like a list of ways to need the senior engineer less. It's the opposite. Every one of those fixes works by concentrating their judgment, not by replacing it.

The senior who reviews well is now the bottleneck and the multiplier. Both, at the same time. Everything the team generates passes through their judgment, so their capacity sets the ceiling. And everything that passes through well is output the team could never have produced without the agents.

Agents can generate. Agents can review, and flag what doesn't add up. But a flag is only a claim. Some flags will be wrong, and some things that should have been flagged won't be. Someone still has to know the difference.

So the whole pipeline, however many agents are in it, is only worth what the person who can tell when it's wrong is worth.

Generation scales. Verification scales with help. The ability to know when the output is wrong does not scale at all. It lives in people who have seen the system fail before.

Agents supply the speed. That person supplies the direction. Without them, it's just speed.

## Where this leaves us

Code review as a manual, line-by-line gate is structurally dead in the AI era. Not because review stopped mattering, but because that form of it can't survive the volume.

The teams making progress are doing two things. They automate the cheap parts: syntax, style, basic bug-catching. And they move the expensive parts, architectural intent and system safety, to earlier, more synchronous, more strategic points in the lifecycle.

If your team's answer to bigger PRs is asking your seniors to read faster, you're optimizing the wrong thing.

Writing code got cheap. Knowing whether it's right didn't. Spend your best people there.
