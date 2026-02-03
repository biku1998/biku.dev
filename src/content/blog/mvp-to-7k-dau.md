---
title: "MVP to 7k DAU with a tiny team: what we built, what we refused to build"
description: "The story of how an MVP grew into a platform with 7k daily active users while the engineering team stayed tiny. What we built, and what we deliberately refused to build."
pubDate: 2025-02-03
tags: ["engineering", "product", "startup"]
---

In 2020, we weren't "building a product." We were duct-taping an experiential upskilling program together using tools like Google Classroom, Google Colab notebooks, Slack apps, and spreadsheets.

It worked, until it didn't.

Our client (Fractal Analytics) wanted more than training delivery. They wanted **skill analytics insights**: not just "who attended," but **who improved, where the gaps were, and how the cohort was drifting week to week**.

So we built an MVP.

This is the story of how that MVP grew into a platform with ~7k daily active users over time, while the engineering team stayed tiny for most of the journey (I built solo until 2023, and we hired frontend specialists only later).

More importantly: what we built, and what we deliberately refused to build.

## The original problem: tools don't give insight

Before the MVP, our "platform" was a stack of disconnected tools:

- Classroom for structure
- Colab for execution
- Slack for coordination
- Manual processes for everything else

The bottleneck wasn't content delivery. It was **measurement**.

We had already shifted away from passive video/self-paced learning toward **experiential learning**: learners worked on mini problem statements to learn by doing. A pilot with ~30 learners worked well enough that Fractal asked us to roll it out across their full data vertical. Early completion was ~70%.

But with duct-taped tools, it was difficult to answer the questions enterprise admins care about:

- Are learners progressing on time, or drifting?
- Which skills are improving, and which are stagnant?
- Which modules are too easy/hard or confusing?
- Who needs intervention?

The MVP's job was simple:

1. Help creators build content flexibly (with a tagging model)
2. Help learners consume content in a structured flow
3. Give enterprise admins (Delivery + L&D) visibility into **progress drift** and **skill drift**

## What DAU meant for us

DAU wasn't "opened the app."

For us, daily activity meant:

- **Active learners:** logged in and did meaningful work (solved a problem, recorded answers, submitted something).
- **Active creators:** created/edited content that day.

It kept us honest: we optimized for practice and progress, not vanity.

## Timeline: MVP to 7k DAU (slow growth, sticky usage)

We launched the MVP in **June 2020**.

- **End of 2020:** ~1k DAU
- **End of 2021:** ~3k DAU
- **Mid 2022:** ~5k DAU
- **2025:** ~7k DAU

This wasn't viral consumer growth. Our business runs in repeat cycles: the same set of users returns annually plus new hires. That means **stability + repeatability** matter more than "growth hacks."

## What broke first (and what we fixed)

The first thing that broke was **onboarding**.

Because we spent very little time on it initially, enterprise behavior hit us:

- People signed up with **personal emails**
- Access control got messy
- Support load went up fast

The fix was unglamorous but effective:

- Store the client's **allowed email domain**
- Block signups that don't match
- Keep tenants separated (e.g., `fractal.<ourdomain>.com`, configurable per client)

After that, onboarding friction mostly collapsed into one common issue: **password reset**.

The takeaway: in enterprise products, onboarding is not "polish." It's part of the production system.

## The learning loop we built (and kept simple)

The learner journey at MVP stayed intentionally straightforward:

**Sign up / log in -> see the program content assigned to you -> start a problem statement -> submit -> see results (score + skill-wise gap).**

The behaviors that correlated most with completion were:

- Consistent engagement (frequent logins + real time spent)
- Revisiting prior modules
- Early activity during the program timeline

That last one surprised me at first, but it makes sense: in these programs, momentum is everything.

## Creators: structured content, not uploads

Creators weren't uploading random docs. They built structured learning objects:

- Projects
- Scenarios
- Masterclasses
- Skill paths (bundles)

Within those, they added:

- Different question types
- Solutions and hints
- Evaluation rubrics

This structure wasn't "nice to have." It was what made skill measurement possible.

### Tagging: the quiet backbone of skill analytics

Tags represented either:

- A **skill** (e.g., data normalization)
- A **tool** (e.g., Postgres/MySQL)

A combination of tags approximated a **role**.

When a learner solved content tagged with a skill/tool, it became a proxy signal for capability. That's how we moved from "content delivered" to "skill insights."

## Admin analytics: we prioritized the two signals that mattered

Admins didn't want a hundred dashboards. They wanted two things they could act on:

1. **Weekly progress drift**
   Are learners falling behind schedule? Is the cohort slipping week by week?

2. **Skill drift**
   Which skill areas are improving? Which are flat or regressing?

Those two views drove the bulk of admin value (and escalations). Everything else was optional.

## Publishing content without destroying trust

Publishing content gets messy when multiple creators and multiple client tenants are involved.

Our flow:

- Content starts as **draft**
- Creator requests publish
- Admin approves
- Then it appears across client tenants

Over time, I learned something painful: content quality issues are often worse than code bugs. Broken content silently destroys trust and engagement.

So we added guardrails:

### Guardrails in the publishing pipeline

We introduced validation checks split into:

- **Errors:** block publishing (e.g., missing correct option)
- **Warnings:** nudge improvement (e.g., missing tags)

Creators had to resolve errors (and usually warnings) before submitting for approval.

### AI review before content goes live

Later, we added an automated AI review that flags:

- Whether the content follows a consistent flow/story
- Whether information seems factually correct
- Whether the solution is correct and easy to consume
- Whether hints are too revealing ("solution in disguise")

It wasn't about replacing humans. It was about preventing obvious quality regressions when you don't have a large editorial/QA function.

## Team reality: tiny engineering, lots of surface area

This wasn't "3 engineers from day one."

- Until **2023**, I built everything solo: frontend, backend, infra, devops
- In **2023**, we hired a frontend engineer so I could focus on backend/infra and client compliance constraints
- Late **2024**, we hired another frontend engineer after the app split

We ran 2-week sprints tracked in Google Sheets. We tried heavier tools; it felt like overhead.

Priority order stayed stable:
**learners -> admins -> creators -> internal**
Learners are employees with limited time. If the platform wastes their time, the program dies.

## Engineering decisions that gave us leverage

The stack was intentionally boring:

- React SPA
- Node.js backend
- Python ETL scripts
- Postgres (self-hosted), later Supabase
- AWS EC2 (barebones SSH early on)
- SendGrid
- No queues early

The MVP stack was intentionally barebones. Since then, the platform has matured significantly: deployment, observability, and data workflows especially. **I'll cover the "what changed and why" in a follow-up post**.

The leverage decisions weren't "which framework." They were:

### 1) Modular boundaries early, abstraction later

We kept clear separations but avoided premature abstractions.
We repeated ourselves early to move fast, and only abstracted once patterns stabilized.

### 2) Feature flags + small releases

Feature flags helped keep staging/prod aligned and prevented massive PRs.
We moved toward trunk-based development and deployed frequently (roughly every 2nd day).

### 3) Database schema design as a first-class decision

Schema mistakes compound over years, especially when reporting formats evolve and client asks vary.
Time spent here paid off repeatedly.

## Reliability: the basics done consistently

Early deployments were manual: SSH, restart, hope. Later we added CI/CD.

The real stability driver was behavioral:

- Trunk-based development
- Small releases
- Avoiding "big bang" deployments

The most common production issues at scale:

- ETL failures
- Slow queries

Observability stayed minimal but useful:

- Sentry
- Uptime monitors
- Basic system-level metrics

## What we refused to build (and why)

Small teams don't win by building more. They win by refusing more.

### 1) One-off enterprise requests

We said no to many features requested by a single client SPOC that didn't generalize.

**Rule:** if it won't be reused across clients/cohorts, it's probably a trap.

### 2) A "full analytics dashboard"

We avoided building fancy dashboards early because data consumption patterns were still evolving.
Ops often needed raw data quickly, so exports were better than polished UI.

### 3) "Give us our own database"

One client asked for it. Internally it briefly became a push.
Instead, I went back to the customer SPOC, clarified the requirement, discussed pricing implications, and they said "not needed."

That single conversation avoided a huge long-term technical and operational burden.

### 4) Microservices

We didn't do microservices.
We kept a fat frontend and fat backend until boundaries were truly justified.

## The inflection point: when the system stopped feeling fragile

The biggest stabilizing shift was moving from duct-taped tools to a real platform **with strong boundaries**:

- Creator vs learner vs admin
- Tenant-aware access controls
- Structured content + tagging leading to skill insights

Once those boundaries were real, the system could run repeat cohorts without heroics.

## What I'd tell anyone building with 2-4 engineers

1. Define DAU as meaningful work, not clicks.
2. Enterprise onboarding guardrails aren't polish, they're foundational.
3. Build the smallest system that produces signals (skill tags leading to role mapping).
4. Exports beat dashboards until consumption patterns stabilize.
5. Refusal is a strategy. Special cases are how tiny teams die.

## What I'm exploring next

I'm interested in roles where engineering is close to the user and the work is product-shaped: **Founding/Senior Product Engineer** or **Tech Lead (Product)**, especially where applied AI is used as a practical lever (like quality systems and workflow automation), not just a demo.
