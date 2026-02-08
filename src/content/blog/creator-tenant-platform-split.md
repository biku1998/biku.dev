---
title: "Re-architecting into Creator Platform + Client Tenant Platform: the split that unblocked velocity"
description: "When your product serves multiple personas, the fastest way to slow down is to pretend they're all the same system. How we split by domain, change-rate, and risk at Enqurious."
pubDate: 2025-02-08
tags: ["engineering", "architecture", "product"]
---

When your product serves multiple personas, the fastest way to slow down is to pretend they're all the same system.

We learned this the hard way building a learning platform at Enqurious: creators are few, tolerant of "beta," and operate in messy workflows. Learners and client admins are many, and even small regressions can erode trust.

At first, we had **one frontend + one backend**. We "supported" different personas by hiding/unhiding widgets, switching flows, and adding branching logic across the stack. It worked… until it didn't.

## The symptom: shipping became a trust risk

A pattern started repeating:

* A small creator-facing change would break learner/client experience.
* We'd justify shipping creator features in "beta" because creators could absorb it.
* But learners and client admins couldn't. One small bug could escalate into a client-facing issue.

As features expanded across creators, learners, and client admins, the codebase became a tangle of:

* branching everywhere (frontend + backend)
* creator changes breaking tenant UX
* permissions becoming hard to reason about (and hard to audit)
* onboarding new engineers getting slower because "everything touched everything"

We tried feature flags. It helped temporarily, but also **multiplied branching**, which made the architecture even harder to maintain.

That's when it became clear: the issue wasn't a missing framework. It was missing boundaries.

## The decision: split by domain, change-rate, and risk

We split the product into two platforms:

### Creator Platform

Creators come here to:

* create content
* publish content
* evaluate learner submissions
* see how their content is being used

### Client Tenant Platform

Client admins and learners come here to:

* browse the content catalog available to their org
* group learners and deploy content to them
* consume content, submit work, and see feedback/scores
* track progress and skills via dashboards

This split wasn't just UX. It was an intentional separation by:

* **data domain** (authoring vs consumption/progress)
* **change rate** (creator workflows move fast; tenant experience must stay stable)
* **risk** (creator experiments shouldn't break learner flows)

## What we actually changed (without premature complexity)

We didn't jump to "microservices everywhere."

* **Separate repos** for Creator and Tenant frontends.
* **One backend**, but reorganized into clear **modules + routing** aligned to the two platforms.
* **Shared packages** extracted into private npm modules so we didn't duplicate primitives.
* **Single DB schema** (on purpose). We avoided splitting the database early because it felt like premature optimization.

This gave us *separation where it mattered most* (surface area + ownership) without adding heavy operational overhead.

## The most important boundary: only published content crosses

The critical workflow became explicit:

**creator drafts content → publish → tenant consumes**

That boundary did a lot of work:

* Tenants only interact with **published** content.
* Draft/iteration chaos stays in Creator land.
* Learner flows don't accidentally depend on unstable creator-facing structures.

Even with some shared tables (like users), we treated the authoring domain and the tenant consumption/progress domain as different "worlds," with the publish step as the bridge.

## Safety: middleware + roles + DB-level RLS

Splitting surfaces reduced accidents, but we still assumed mistakes would happen and designed for defense-in-depth:

* Different endpoints enforced different auth middleware depending on who should access them.
* Clear roles existed (creator roles like author/reviewer/evaluator; client admin roles; learner roles).
* At the database layer we enabled **Row-Level Security (RLS)** so that even if an endpoint had a bug, the DB would be the last line of defense against wrong data access.

When your platform is multi-tenant, "we'll be careful" isn't a strategy. RLS is.

## Migration: gradual routing + feature-flagged cutover

We avoided a big-bang rewrite.

* We introduced new URLs/subdomains:

  * creator → `creator.<domain>`
  * tenant/learner → `<tenant>.<domain>` (e.g., `fractal.<domain>`)
* We migrated incrementally and routed traffic gradually by tenant behind feature flags.
* The biggest risks we actively mitigated:

  * permission leaks
  * publishing breaking cohorts mid-program
  * data migration to the evolved schema

For monitoring, we kept it simple but effective:

* logs + error monitoring (we leaned heavily on Sentry-style visibility)

## What improved (and why it felt immediate)

Once boundaries were real, several things got better quickly:

* **Onboarding improved**: new engineers could take ownership of Creator or Tenant context without worrying they'd break the other side.
* **PR merge time dropped**: less branching, fewer "this might affect X" discussions, clearer code ownership.
* **Fewer regressions**: creator experiments stopped spilling into learner/client-critical flows.
* **Parallel workstreams** became normal: teams could move faster without stepping on each other.

In practice, anecdotally, velocity felt roughly **~1.5× faster** across the board because we removed the biggest tax: *coupling*.

## The tradeoff: more contracts, more deployments

This split wasn't "free":

* more contract discipline
* more deployments (and more things to keep aligned)

But for us, it was worth it, because it let us ship faster **without** increasing client risk.

## What I'd do differently if restarting today

Two things:

1. I'd make migration steps even simpler (less "in-between states").
2. I'd be a bit more deliberate in the initial split boundaries (to avoid small boundary redraws later).

## A quick checklist: when should you split a platform?

If you're seeing **2+** of these repeatedly, it's usually time:

* changes for one persona frequently break another persona's critical flows
* branching logic is your primary architecture tool
* permissions are hard to reason about or audit
* onboarding requires explaining the entire system
* release velocity is throttled by "fear of side effects"

You don't need microservices. You need boundaries.
