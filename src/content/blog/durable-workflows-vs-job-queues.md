---
title: "Your Agent Shouldn't Send the Email Twice: Durable Workflows vs Job Queues"
description: "A job queue retries the whole job. For an agent that has already spent thousands of tokens and sent an email, that's a bug. How durable execution works, a small demo that measures the difference, why you still need idempotency keys, and when a plain queue is still the right call."
pubDate: 2026-11-22
tags: ["engineering", "ai", "agents"]
draft: false
image: "/blog-posters/Four.png"
---

Your agent is halfway through a task. It has planned, searched, drafted an email to a customer and sent it. Then you deploy.

The worker restarts. The queue sees a job that never finished, and hands it to another worker. The agent plans again, searches again, drafts again and sends the email again.

Your customer now has two emails. Your LLM bill has the same work on it twice. And nothing crashed loudly, because from the queue's point of view everything worked exactly as designed.

## What Lee said

In his Stanford CS146S lecture, [*How always-on agents work*](https://www.youtube.com/watch?v=L1OBRtfPS34), Lee Robinson described this exact problem when he walked through the infrastructure behind Grok Bot, the always-on agent he works on at SpaceX.

The primitive to think about, he said, "is a workflow versus a job queue":

> "With a normal queue, if that crashes and you go to restart it, well, now you have to replay steps one, two, and three, which is obviously that that could be pretty problematic. So, what you really want here is you want a durable workflow, which means that it's safe for you to actually retry that, and when you retry after a failure, it picks right up on step three."

His team doesn't build this themselves: "we use an open source tool called Temporal… so that we don't have to rebuild a lot of this very complicated stuff from scratch." With one honest caveat: "Of course, you still have to run the infrastructure for it."

It goes deeper than the main loop. The helpers the main agent hands work to are durable too: "Each one of these is its own durable workflow," so if the video helper "crashes… uses up too much memory or something, that can restart and keep going without losing progress along the way."

And the agent's computer is designed to come and go. It runs on a Firecracker virtual machine because "it's very easy then to essentially snapshot the state of the machine and shut it down and start it back up," while the conversation logs, memories and routines are "persisted to… a database." Machines are disposable. Progress isn't.

## Why queues retry the whole job

A job queue doesn't know what your job did. It only knows whether the job finished.

That's a deliberate design, and every major queue documents it:

- **Amazon SQS** has an [at-least-once delivery model](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html). If you don't process and delete a message before its visibility timeout expires, "due to application errors, crashes, or connectivity problems," the message becomes visible again and another consumer gets it.
- **Celery** with [`acks_late`](https://docs.celeryq.dev/en/stable/userguide/tasks.html) acknowledges a task after it runs, which "means the task may be executed multiple times should the worker crash in the middle of execution. Make sure your tasks are idempotent." The default, acknowledging *before* running, avoids that by risking the opposite: a task that crashes halfway is never run again.
- **BullMQ** marks a job as [stalled](https://docs.bullmq.io/guide/workers/stalled-jobs) if the worker stops renewing its lock, and "a stalled job is moved back to the waiting status and will be processed again by another worker."

At-least-once is the right default for most work. A thumbnail that gets resized twice costs you a few milliseconds.

An agent run isn't a thumbnail. It's a chain of steps where some are expensive (LLM calls) and some can't be undone (emails, payments, messages to other people). Retrying the whole chain means paying for the expensive steps again and repeating the irreversible ones.

## How durable execution works

Durable execution changes the unit of retry from the job to the step.

The workflow engine keeps an append-only log of what each step returned. Temporal calls it the [Event History](https://docs.temporal.io/workflow-execution/event): it's "durably persisted by the Temporal Service, so your application state survives crashes or failures," and it's what "enables the Workflow Execution to recover from a crash and continue making progress."

When a worker dies and another picks the run up, it doesn't start over. It runs your workflow code from the top, but every step that already finished returns its recorded result instead of running again. The code "replays" to where it left off, then carries on with real work.

That has two consequences:

**The work goes into steps.** Temporal calls them Activities. Its docs say to put "API calls, LLM/AI invocations, database queries, and other external interactions" [in Activities](https://docs.temporal.io/workflow-definition). Activities have [timeouts and retry policies](https://docs.temporal.io/activity-definition), so a step that fails is retried on its own.

**The workflow code must be deterministic.** On replay it has to ask for the same steps in the same order, or the engine can't match the code to the log. In Temporal's words, a [Workflow Definition](https://docs.temporal.io/workflow-definition) "must be deterministic to support replay." If replayed code produces different steps, "the Workflow Execution returns a non-deterministic error."

Because the log is the state, waiting costs nothing. A Temporal workflow can [sleep for months](https://docs.temporal.io/develop/typescript/timers), and "even if your Worker or Temporal Service is down when the time period completes," the sleep resolves when they come back. It can also wait for a [Signal](https://docs.temporal.io/encyclopedia/workflow-message-passing), like a person clicking "approve", without holding a process open. For an agent that needs a human to sign off before it sends something, that's exactly the shape you want.

## I measured it

To see the difference in numbers, I wrote a small simulation in Node with no dependencies. An agent follows up with a customer in five steps:

1. **Plan** (an LLM call, 1,200 tokens)
2. **Search** for the account's status
3. **Draft** the email (an LLM call, 3,400 tokens)
4. **Send** the email
5. **Summarise** for the CRM (an LLM call, 800 tokens)

The LLM, search API and email provider are fakes that count every call. Each attempt runs in its own Node process, and a "crash" is `process.exit(137)`, the exit code of a process killed outright, the way the out-of-memory killer or a forced shutdown does it. Nothing survives a crash except what's on disk.

The job-queue version is one function, and the crash comes after the email is sent but before the job finishes:

```js
const plan = await llm("plan a follow-up for Acme", 1_200);
const results = await search("Acme renewal status");
const draft = await llm(`draft an email using ${results}`, 3_400);
await sendEmail("cto@acme.com", draft);
if (crashAfterEmail) process.exit(137); // deploy, OOM kill, spot instance gone
await llm("summarise what happened for the CRM", 800);
```

The durable version uses a toy runner: about 20 lines that journal each step's result to a JSON file and replay it on restart. **It's a teaching toy, not a replacement for Temporal.** It has no timeouts, retries, concurrency or locking. But it shows the core idea:

```js
export function durableRun(runId) {
  const file = new URL(`./journal-${runId}.json`, import.meta.url);
  const journal = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
  let i = 0;

  return async function step(name, fn) {
    const entry = journal[i++];
    if (entry) {
      // Replaying: the code must ask for the same steps in the same order.
      if (entry.name !== name) {
        throw new Error(`Non-determinism: step ${i} was "${entry.name}" in the journal, now "${name}"`);
      }
      return entry.result;
    }
    const result = await fn();
    journal.push({ name, result });
    writeFileSync(file, JSON.stringify(journal, null, 2)); // record before moving on
    return result;
  };
}
```

The agent wraps each step (shown without the switches that inject the crashes):

```js
const runId = "acme-follow-up";
const step = durableRun(runId);

const plan = await step("plan", () => llm("plan a follow-up for Acme", 1_200));
const results = await step("search", () => search("Acme renewal status"));
const draft = await step("draft", () => llm(`draft an email using ${results}`, 3_400));
await step("send-email", () => sendEmail("cto@acme.com", draft, `${runId}:send-email`));
await step("crm-summary", () => llm("summarise what happened for the CRM", 800));
```

Same crash, same restart. Here's the real output:

```text
No crash (baseline)                LLM calls: 3  tokens: 5,400  searches: 1  emails sent: 1
Job queue, crash + redelivery      LLM calls: 5  tokens: 10,000  searches: 2  emails sent: 2
Durable, crash + replay            LLM calls: 3  tokens: 5,400  searches: 1  emails sent: 1
```

The queue nearly doubled the tokens and sent the customer a second email. The durable run did exactly what a run without a crash would have done.

These are small numbers because it's a five-step toy. A real always-on agent might be fifty tool calls and several hundred thousand tokens into a task when the deploy lands. The ratio is the same. The bill isn't.

## You still need idempotency keys

Durable execution doesn't make side effects happen exactly once. It's easy to miss this, and every engine says so in its docs.

Look at where the toy runner writes to the journal: *after* the step returns. If the process dies after the email goes out but before the journal is written, the engine has no record of the step. On restart, it runs it again.

Temporal's [Activity docs](https://docs.temporal.io/activity-definition) describe exactly this case. A worker finishes an activity but crashes "just before it notifies the Temporal Service," so "the Activity will be retried. If the Activity is not idempotent, this could have negative consequences, such as duplicate charges." Their advice is to "always make your business logic Activities idempotent." [Inngest](https://www.inngest.com/docs/features/inngest-functions/steps-workflows) says the same: "A step does not make an external action exactly once."

I ran that case too. The process dies inside the send step, after the email is sent but before the step is recorded:

```text
Durable, crash mid-step, no key    LLM calls: 3  tokens: 5,400  searches: 1  emails sent: 2
Durable, crash mid-step, with key  LLM calls: 3  tokens: 5,400  searches: 1  emails sent: 1
```

The LLM calls are still saved: those steps were already recorded. But without an idempotency key, the customer gets two emails.

The fix is an idempotency key: a value that stays the same across retries of one step and is unique to that step. The service you call uses it to spot repeats. [Stripe](https://docs.stripe.com/api/idempotent_requests) is the standard example: send the same `Idempotency-Key` again, and "you can safely repeat the request without risk of creating a second object or performing the update twice." Temporal suggests building the key from the workflow's run ID and the activity ID, "since this is guaranteed to be consistent across retry attempts but unique among Workflow Executions."

The key is enforced by the service you call, not by your code. If your email provider, payment API or internal service doesn't accept one, that's the gap to close first.

## What breaks durable workflows: non-determinism

The other rule is the one that bites teams after they adopt this: workflow code must make the same decisions on replay.

Here's a workflow that branches on `Math.random()`:

```js
await step("plan", () => llm("plan", 1_200));
if (Math.random() < 0.5) await step("search-docs", () => search("docs"));
else await step("search-web", () => search("web"));
await step("draft", () => llm("draft", 3_400));
```

On the first run it picked `search-docs`, then crashed. On the replay, `Math.random()` came out differently (I stubbed it to make the demo repeatable):

```text
random branch, attempt 2: Error: Non-determinism: step 2 was "search-docs" in the journal, now "search-web"
```

The recorded history and the code disagree, so there's no safe way to continue. Temporal fails the same way, with a non-determinism error.

The same thing happens with `Date.now()`, reading a file, calling an API directly from workflow code, or deploying new code that adds or reorders steps while runs are in flight. The fixes:

- **Put anything non-deterministic in a step.** The step's result is recorded, so replays see the same value. For small values like a UUID, Temporal has a [Side Effect](https://docs.temporal.io/workflow-execution/event) that "executes the provided function once and records its result." Some engines handle the common cases for you: [Vercel's Workflow](https://useworkflow.dev/docs/foundations/workflows-and-steps) fixes `Math.random` and `Date` inside workflow functions so "the values don't change across replays."
- **Version your workflow code.** Temporal has [versioning and patching](https://docs.temporal.io/workflow-definition) for changing code while old runs are still going. Plan for it before your first deploy, not after your first non-determinism error.

## The same agent in Temporal

Here's the follow-up agent as a real Temporal workflow in TypeScript, with one addition: it waits for a person to approve the email before sending it. It typechecks against the Temporal TypeScript SDK (1.26).

```ts
import { proxyActivities, defineSignal, setHandler, condition } from "@temporalio/workflow";
import type * as activities from "./activities.js";

const { plan, search, draftEmail, sendEmail } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: { maximumAttempts: 5 },
});

export const approve = defineSignal<[boolean]>("approve");

export async function followUp(goal: string, to: string): Promise<string> {
  let approved: boolean | undefined;
  setHandler(approve, (ok) => {
    approved = ok;
  });

  const steps = await plan(goal);
  const results = await search(goal);
  const draft = await draftEmail(steps, results);

  // Wait for a human, for up to three days, without holding a process open.
  const answered = await condition(() => approved !== undefined, "3 days");
  if (!answered || !approved) return "not sent";

  await sendEmail(to, draft);
  return "sent";
}
```

Each `await` on an activity is a recorded step. The three-day wait is a durable timer: no process is held open while it waits, and a worker restart doesn't reset it. The approval arrives as a Signal.

The email activity builds its idempotency key the way Temporal's docs suggest, from the run ID and the activity ID:

```ts
export async function sendEmail(to: string, body: string): Promise<void> {
  // Stable across retries of this activity, unique per workflow run.
  const { workflowExecution, activityId } = Context.current().info;
  if (!workflowExecution) throw new Error("sendEmail must run inside a workflow");
  const idempotencyKey = `${workflowExecution.runId}:${activityId}`;
  await emailProvider.send({ to, body, idempotencyKey });
}
```

## The landscape

You don't have to run Temporal. The same idea shows up in several products, each with its own trade-offs:

| Tool | What it is |
|---|---|
| [Temporal](https://docs.temporal.io) | Open-source durable execution platform. What Lee's team uses. Self-host it or use Temporal Cloud. |
| [Inngest](https://www.inngest.com/docs/features/inngest-functions/steps-workflows) | Steps via `step.run`. It "saves the result of each completed step," plus durable sleeps and event waits. |
| [Restate](https://docs.restate.dev/) | A lightweight runtime where code "automatically stores completed steps and resumes from where it left off." |
| [DBOS](https://docs.dbos.dev/) | A library: "add a few annotations to your application to durably execute it." |
| [Cloudflare Workflows](https://developers.cloudflare.com/workflows/) | Durable multi-step execution on Workers, with retries, sleeps and waiting for approvals. |
| [Vercel Workflow](https://useworkflow.dev/docs/foundations/workflows-and-steps) | `"use workflow"` and `"use step"` directives. Step results are "persisted to the event log." |

They differ a lot in where state lives, what you have to operate, which languages they support and how much they cost at scale. They share the model in this post: steps, a recorded history, replay, and the same two rules about idempotency and determinism.

## When a queue is still fine

Durable execution isn't free. It adds a system to run or pay for, a programming model with rules, and a step history that grows with every action. For a lot of background work, a queue is still the better tool.

| | Job queue | Durable workflow |
|---|---|---|
| **Length** | Seconds | Minutes to weeks |
| **Steps** | One, or a few cheap ones | Many, some expensive |
| **Retrying everything costs** | Almost nothing | Real money: LLM tokens, API calls |
| **Side effects** | Idempotent, or none | Emails, payments, messages that can't be undone |
| **Waiting** | Never | For people, for other systems, for time |
| **Examples** | Resize an image, send one webhook, reindex a document | An agent's task, an approval flow, a multi-day onboarding |

A useful test: if this job died at the worst possible moment and ran again from the top, what would it cost? If the answer is "nothing", use a queue. If it's tokens, duplicate emails or a confused customer, use durable execution.

## The costs

**Something to operate.** Lee's caveat applies: "you still have to run the infrastructure for it." Self-hosting Temporal means running its service and a database behind it. Managed options trade that for a bill and a vendor.

**A programming model with rules.** Deterministic workflow code, everything else in steps, and versioning when you change code under running workflows. It's learnable, but it's a real shift for a team used to plain functions.

**History limits.** Temporal limits each workflow's [Event History](https://docs.temporal.io/workflow-execution/limits) to 51,200 events or 50 MB, and warns after 10,240 events or 10 MB. An always-on agent that runs for weeks will hit that. The usual answer is [Continue-As-New](https://docs.temporal.io/workflow-execution/event): close the current run and start a fresh one that carries the state forward. Design for it from the start.

**Step granularity.** Temporal's docs point out the trade-off: one big activity is cheaper to record but retries everything inside it, while smaller ones retry only what failed but grow the history. A good default for agents: one step per LLM call or tool call.

## A checklist

1. **Ask what a retry from the top would cost.** If it's tokens or side effects, a plain queue isn't enough.
2. **Make every LLM call and tool call its own step.** That's the unit you don't want to pay for twice.
3. **Keep workflow code deterministic.** No `Date.now()`, `Math.random()`, network or file access outside steps, unless your engine makes them replay-safe.
4. **Give every side effect an idempotency key.** Stable across retries, unique per step. Check that the services you call accept one.
5. **Wait with the engine, not a process.** Human approvals and long delays should be durable timers and signals, not a worker sleeping in a loop.
6. **Plan for code changes.** Learn your engine's versioning before you deploy a change under running workflows.
7. **Watch history size.** Continue-As-New before you hit the limit, not after.
8. **Keep state off the machine.** Like Lee's design: the VM can be snapshotted, shut down and rebuilt. The workflow history and the database hold the progress.
9. **Test the crash.** Kill a worker mid-run in staging and check what ran twice. The demo above is a 20-line version of that test.

## Where this is heading

In Lee's list of the building blocks agent products are being built from, durable workflows came first: "durable workflows, sandboxes, computers in the cloud, memory skills…"

That ordering makes sense. Everything else on the list assumes the agent can survive a restart. Memory is useless if the run that would have used it starts over. A sandbox is disposable only if the work in it can be picked up again.

Web apps spent fifteen years learning to treat servers as cattle, not pets: any machine can die, and the database remembers. Agents are learning the same lesson, with one difference. When a web request is retried, you lose a few milliseconds. When an agent's run is retried, you pay for its thinking again and repeat its actions in the world.

So record every step. Key every side effect. And never send the email twice.
