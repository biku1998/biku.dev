---
title: "Accessibility Is the New SEO. Your Next User Is an Agent."
description: "AI agents don't see your product the way people do. They read its accessibility tree. What that tree is, what I measured on real pages, why div soup makes your product invisible to agents, and a checklist to fix it."
pubDate: 2026-10-20
tags: ["engineering", "ai", "agents", "accessibility"]
draft: false
image: "/blog-posters/Five.png"
---

Someone asks their agent to upgrade them to your Pro plan.

The agent opens your pricing page. It finds a heading, a price, and an email field. Then it finds three things labelled `generic`: one says "Monthly", one says "Upgrade", and one has no text at all.

It doesn't know which of them is a button. It doesn't know "Monthly" opens a dropdown. It has no idea the empty one is your cart.

So it guesses. Or it gives up and tells the user: "I couldn't complete the upgrade. You may need to do it yourself."

You never see this happen. There's no bounce in your analytics and no support ticket. A customer who was ready to pay just didn't.

## How agents actually see your product

In his Stanford CS146S lecture on always-on agents, Lee Robinson described the three ways an agent can read a page on the computer it controls. It can take a **screenshot**. It can read the **HTML**. Or it can read the **accessibility tree**, which he called "a nice way of cutting down a lot of the token usage" that helps the agent "find the buttons or links or other elements" it wants to click. Clicking raw pixels is the fallback when all three fail.

The accessibility tree isn't new. Browsers have built it for decades so screen readers can tell a blind user "button, Upgrade to Pro" instead of reading out a pile of `<div>` tags. It's a simplified copy of your page: every element reduced to a **role** (button, link, textbox, heading), a **name** ("Upgrade to Pro"), and a **state** (checked, expanded, disabled).

That's exactly what an agent needs. What is this thing, what is it called, and can I act on it?

The agent tooling has quietly standardised on it:

- **Playwright MCP**, one of the most widely used browser tools for agents, [uses accessibility snapshots instead of screenshots](https://playwright.dev/mcp/snapshots) by default. Every element gets a ref, and the model clicks by ref (`e13`) instead of guessing coordinates. Vision mode is opt-in.
- **OpenAI** says in its [publishers and developers FAQ](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq) that the agent in ChatGPT Atlas "uses ARIA tags, the same labels and roles that support screen readers, to interpret page structure and interactive elements." Their advice to site owners is to follow WAI-ARIA best practices.

For twenty years, we structured pages so Google's crawler could understand them. The next reader that matters isn't indexing your page. It's trying to *use* it. And it reads the accessibility tree.

## I measured it

The usual pitch is "the accessibility tree is tiny, HTML is huge." I wanted real numbers, so I ran a small Playwright script against a handful of public pages. For each one I counted the tokens in three things:

- the rendered HTML,
- the accessibility snapshot an agent receives (the format Playwright MCP sends: roles, names and refs),
- the screenshots needed to cover the full page at a 1280×800 viewport.

Each page was captured after the DOM loaded plus a few seconds for client-side rendering to settle. Token counts come from OpenAI's `o200k` tokenizer. Screenshot costs use [Anthropic's published formula](https://platform.claude.com/docs/en/build-with-claude/vision) of one visual token per 28×28 pixel patch, about 1,334 tokens per 1280×800 viewport. Other tokenizers will give different absolute numbers, but the ratios hold.

| Page | HTML | Agent snapshot | HTML ÷ snapshot | Screenshots for full page |
| --- | --- | --- | --- | --- |
| GitHub login | 20,826 | 686 | **30×** | ~1,300 (1 viewport) |
| Vercel homepage | 221,100 | 5,600 | **39×** | ~9,300 (7 viewports) |
| Stripe pricing | 233,278 | 23,450 | **10×** | ~20,000 (15 viewports) |
| BBC News | 116,143 | 11,960 | **10×** | ~10,700 (8 viewports) |
| Wikipedia article | 211,826 | 61,266 | **3.5×** | ~37,000 (28 viewports) |
| This blog | 5,724 | 2,575 | **2.2×** | ~5,300 (4 viewports) |
| Hacker News | 11,651 | 15,229 | **0.8×** | ~2,700 (2 viewports) |

Three things surprised me.

**The win scales with framework bloat.** Vercel's homepage ships 221k tokens of HTML, mostly class names, inline scripts and hydration data. The part an agent can actually use fits in 5.6k. That's a 39× difference. Modern framework-heavy sites are exactly where raw HTML is most hopeless for an agent.

**On lean, semantic pages, it barely matters.** Hacker News is famously minimal HTML, and its snapshot is actually *larger* than its markup. The front page has 228 links, and every one gets its own line, name and ref. Snapshot size tracks how much there is to act on, not how well the page is built. This blog is static Astro output with a 2.2× difference. If your HTML is already clean, the HTML was never the problem.

**Screenshots are cheaper than you'd think, and that's not the point.** One viewport costs about 1,300 tokens, less than most of these snapshots. But a screenshot tells the model where pixels are, not what they mean. It has to work out "that blue rectangle is probably the submit button", estimate coordinates (Anthropic's own docs call coordinate outputs "approximate"), act, and then take another screenshot to see if it worked. Text in a screenshot also has to be read back by a vision model, so anything small or low-contrast gets lost.

So the honest version of the claim isn't "the accessibility tree is always smallest." It's this: **the accessibility tree is the only representation that gives the agent both meaning and a reliable handle to act on, at a cost that doesn't explode with your frontend stack.**

There's a catch. The tree is only as good as your markup.

## Div soup is invisible to agents

Here's a pricing card built the way plenty of production UIs are, all `<div>`s and click handlers:

```html
<div class="icon-btn" onclick="openCart()"><svg>…</svg></div>
<div class="card">
  <div class="title">Pro plan</div>
  <div class="price">$20/mo</div>
  <input type="email" placeholder="you@company.com">
  <div class="dropdown" onclick="toggle()"><span>Monthly</span></div>
  <div class="btn primary" onclick="buy()">Upgrade</div>
</div>
```

It looks fine in a browser. This is the snapshot an agent receives:

```yaml
- generic [ref=e1]:
  - img [ref=e4]
  - generic [ref=e6]:
    - generic [ref=e7]: Pro plan
    - generic [ref=e8]: $20/mo
    - textbox "you@company.com" [ref=e9]
    - generic [ref=e10]: Monthly
    - generic [ref=e11]: Upgrade
```

The cart button became an unnamed image. The dropdown and the upgrade button are both `generic`, just text with no hint that they do anything. The email field's only name is its placeholder.

Now the same card with semantic HTML:

```html
<nav aria-label="Main">
  <a href="/">Acme home</a>
  <button aria-label="Open cart (2 items)"><svg aria-hidden="true">…</svg></button>
</nav>
<main>
  <section aria-labelledby="pro">
    <h2 id="pro">Pro plan</h2>
    <p>$20/mo</p>
    <label for="email">Work email</label>
    <input id="email" type="email" placeholder="you@company.com">
    <label for="cycle">Billing cycle</label>
    <select id="cycle"><option>Monthly</option><option>Yearly</option></select>
    <button type="submit">Upgrade to Pro</button>
  </section>
</main>
```

And its snapshot (trimmed slightly for readability):

```yaml
- navigation "Main" [ref=e2]:
  - link "Acme home" [ref=e3]
  - button "Open cart (2 items)" [ref=e4]
- main [ref=e7]:
  - region "Pro plan" [ref=e8]:
    - heading "Pro plan" [level=2] [ref=e9]
    - paragraph [ref=e10]: $20/mo
    - textbox "Work email" [ref=e11]
    - combobox "Billing cycle" [ref=e12]:
      - option "Monthly" [selected]
      - option "Yearly"
    - button "Upgrade to Pro" [ref=e13]
```

Same visual result. Completely different product, as far as the agent is concerned. Now it knows there's a cart with two items, that billing has two options and Monthly is selected, and that `e13` is the one button that does the upgrade. "Upgrade the user to Pro, yearly" becomes two unambiguous actions.

No new framework. No AI-specific markup. Just the HTML elements we were supposed to be using all along.

## The web is mostly div soup

If this were a niche problem, it wouldn't be worth a post. It isn't.

The [WebAIM Million](https://webaim.org/projects/million/) scans the home pages of the top one million websites every year. The February 2026 run found:

- **95.9%** of home pages had detectable WCAG 2 failures, up from 94.8% the year before, reversing years of slow improvement.
- An average of **56.1 errors per page**, up from 51.
- **51%** of pages had form inputs with no label.
- **46.3%** had empty links, and **30.6%** had empty buttons.

Every one of those last three is an element an agent can't name. An unlabelled input is a field the agent has to guess about. An empty button is the cart icon from the example above.

And it's getting harder, not easier. The average home page now has **1,437 elements**, a 22.5% jump in a single year. More UI, same broken semantics.

## Don't turn ARIA into keyword stuffing

The obvious next move is to sprinkle `aria-label` everywhere so agents can read the page. Be careful.

The same WebAIM report found that home pages using ARIA averaged **59.1 errors**, against **42** for pages without it. WebAIM is careful to say that doesn't prove ARIA caused the errors, since ARIA-heavy pages also tend to be more complex. But the accessibility community has a rule for a reason: no ARIA is better than bad ARIA.

Adrian Roselli made a sharper point in [his response to OpenAI's guidance](https://adrianroselli.com/2025/10/openai-aria-and-seo-making-the-web-worse.html). If teams start treating ARIA as metadata to steer bots, the web ends up worse for the disabled people ARIA was built for. We've seen this movie before. It's what keyword stuffing did to SEO.

The fix is to reach for native elements first. A real `<button>` gets the right role, keyboard support and focus behaviour for free. ARIA is for the gaps, like naming an icon-only button or marking a custom widget's expanded state. It's not a layer of hints on top of div soup.

The good news is that the two audiences want the same thing. Markup that works for a screen reader user works for an agent. There's no separate "agent version" to build.

## Look at your product the way an agent does

You can't fix what you've never seen. Three ways to look, from quickest to most durable.

### 1) Chrome DevTools

Open the Elements panel, go to the **Accessibility** tab, and tick **Enable full-page accessibility tree**. You can now switch the Elements panel to a tree view of roles and names. Click through your signup or checkout flow. Every `generic` that you can click is a problem.

### 2) A one-off snapshot

Playwright can print the same kind of snapshot I used above:

```ts
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("https://your-app.com/pricing");
// Wait for the real UI, not just the HTML shell
await page.getByRole("button", { name: "Upgrade to Pro" }).waitFor();
console.log(await page.locator("body").ariaSnapshot());
await browser.close();
```

Read it as if you were the agent. Could you complete the task from this text alone?

Two things to watch for. First, timing. On a client-rendered app, the tree right after page load can be a spinner and an empty `main`. Wait for an element you know belongs to the finished page, as above. Playwright's docs discourage the tempting `networkidle` shortcut in favour of waiting on what you actually expect.

Second, iframes. `ariaSnapshot()` on the page shows an embedded frame as a bare `- iframe` line and doesn't descend into it. The snapshot Playwright MCP gives agents does: when I tested a cross-origin iframe, its fields came through with their own refs (`f1e2`, `f1e3`). So if your checkout embeds a payment form, your debugging view and the agent's view will differ. Check the frame separately with `page.frameLocator("iframe")`.

### 3) A test that keeps it fixed

Once a critical flow is fixed, keep it fixed. Playwright's `toMatchAriaSnapshot` asserts on the tree, and partial matches are allowed, so you only pin what matters:

```ts
import { test, expect } from "@playwright/test";

test("pricing card is usable by agents and screen readers", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByRole("main")).toMatchAriaSnapshot(`
    - heading "Pro plan" [level=2]
    - textbox "Work email"
    - combobox "Billing cycle"
    - button "Upgrade to Pro"
  `);
});
```

If someone rewrites the button as a styled `<div>`, the test fails. That's a harness for your UI, in the same spirit as [the harnesses we build around agents](/blog/harness-engineering): don't ask people to remember, make the regression impossible to merge.

## A checklist for agent-readable products

Most of this is basic accessibility. That's the point.

1. **Use native elements.** `<button>` for actions, `<a href>` for navigation, `<select>` or a proper combobox for choices. A `div` with `onclick` is invisible.
2. **Label every input.** A visible `<label>`, not just a placeholder. Placeholders disappear as soon as someone types.
3. **Name every icon-only control.** Cart, close, menu, settings. If the button has no text, it needs an `aria-label`, and the icon needs `aria-hidden="true"`.
4. **Write button text that says what happens.** "Upgrade to Pro" beats "Submit". An agent with five buttons on screen picks by name.
5. **Give the page structure.** One `<main>`, real headings in order, `<nav>` for navigation. Landmarks let the agent jump straight to the part it needs.
6. **Expose state.** `aria-expanded` on things that open, `aria-selected` or `aria-checked` on things that are chosen, real `disabled` on things that can't be used yet. Otherwise the agent clicks and has no idea what changed.
7. **Make modals real dialogs.** `role="dialog"`, a name, and focus moved into it. Lee called out modals specifically as a reason agents fall back to clicking pixels.
8. **Don't hide actions behind hover.** If a control only appears on mouseover, an agent reading the tree may never know it exists.
9. **Keep the important stuff out of `<canvas>`.** A chart is fine. A checkout form drawn on canvas has no tree at all.
10. **Don't block the agents you want.** A perfect tree doesn't help if your bot protection stops the agent at the door. Blanket "block all automation" rules will catch user-directed agents along with scrapers. Major agents now identify themselves cryptographically: ChatGPT's cloud browser [signs its requests with Web Bot Auth](https://help.openai.com/en/articles/11845367-chatgpt-works-cloud-browser-allowlisting), and Cloudflare recognises [signed agents](https://blog.cloudflare.com/signed-agents/) as their own category. Decide on purpose which ones you let through.

## Where this is heading

Lee's prediction is that within a year, agents will be doing real work for people over days and weeks, through computers of their own. A lot of that work is filling in forms, comparing plans, booking things and buying things on websites that never shipped an API.

Some products will be easy for agents to use. Some won't. Users won't see the difference directly. They'll just notice that their agent "can do" one service and "keeps failing" at another, and quietly move to the one that works.

That's exactly how SEO played out. Nobody chose a search engine's favourite sites on purpose. The sites that were easy to crawl simply won.

The difference this time is that the work is the same work we've been putting off for twenty years. Accessibility was always the right thing to do for the people who rely on it. Now it's also how your product gets used by the fastest-growing kind of user on the web.

Build the button. Label the input. Your next user might not have eyes, and might not be human.
