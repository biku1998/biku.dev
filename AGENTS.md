# AGENTS.md — Single Source of Truth for AI Agents

This file is the authoritative reference for any AI agent working on the **biku.dev** codebase. Read it in full before making any changes.

---

## Project Overview

**biku.dev** is the personal portfolio and technical blog of Sourabh Kumar (product engineer, Head of Engineering at Enqurious). It is a static site that:

- Showcases professional experience via a career timeline
- Publishes long-form technical writing on engineering and product topics
- Provides RSS feed, sitemap, and full SEO metadata

The site intentionally stays minimal. Do not add complexity, dependencies, or "nice to have" features that were not requested.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Astro | `^5.16.15` |
| Styling | Tailwind CSS v4 | `^4.1.18` |
| Typography | @tailwindcss/typography | `^0.5.19` |
| Tailwind integration | @tailwindcss/vite | `^4.1.18` |
| Font | Geist Mono Variable | `^5.2.7` |
| RSS | @astrojs/rss | `^4.0.15` |
| Sitemap | @astrojs/sitemap | `^3.7.0` |
| Language | TypeScript (strict) | via Astro |
| Deployment | Vercel | static output |

**Package manager:** pnpm (inferred from lockfile conventions; use `pnpm`, not `npm` or `yarn`).

---

## Development Commands

```bash
pnpm dev        # Start dev server (http://localhost:4321)
pnpm build      # Production build → dist/
pnpm preview    # Preview production build locally
```

After any build, validate that `dist/` is generated without errors before considering a task complete.

---

## Project Structure

```
biku.dev/
├── src/
│   ├── components/          # Reusable .astro components
│   │   └── icons/           # SVG icon components (Sun, Moon, GitHub, LinkedIn, Email)
│   ├── content/
│   │   └── blog/            # Markdown blog posts (.md)
│   ├── data/
│   │   ├── site.ts          # Centralised site metadata (siteConfig)
│   │   └── experience.ts    # Career timeline data array
│   ├── layouts/
│   │   ├── BaseLayout.astro # Root HTML shell; handles theme init + SEO
│   │   ├── PageLayout.astro # Adds Header + Footer + centred max-w-2xl container
│   │   └── BlogLayout.astro # Extends PageLayout; adds article header, TOC, prose wrapper
│   ├── lib/
│   │   └── utils.ts         # Pure helpers: formatDate, formatDateShort, slugify, cn, getReadingTime
│   ├── pages/
│   │   ├── index.astro      # Home: profile, timeline, recent posts
│   │   ├── blog/
│   │   │   ├── index.astro  # Blog listing with tag filters
│   │   │   └── [slug].astro # Individual post (dynamic, static paths)
│   │   ├── tags/
│   │   │   └── [tag].astro  # Tag-filtered post listing (dynamic, static paths)
│   │   └── rss.xml.ts       # RSS feed endpoint
│   ├── styles/
│   │   └── global.css       # Theme CSS variables, Tailwind imports, utility classes, prose overrides
│   └── content.config.ts    # Astro Content Collections schema (Zod)
├── public/                  # Static assets served as-is
│   ├── favicon.svg
│   ├── favicon.ico
│   ├── me.png
│   └── me-talking-at-tech-sparks.webp
├── astro.config.mjs         # Astro config: site URL, sitemap, Shiki, Tailwind vite plugin
├── tsconfig.json            # Extends astro/tsconfigs/strict
├── vercel.json              # Vercel deployment config
└── package.json
```

---

## Architecture & Key Patterns

### Layout Hierarchy

```
BaseLayout          ← HTML shell, <head>, theme script, global CSS
  └── PageLayout    ← Header + Footer + centred content slot
        └── BlogLayout  ← Article header (title/date/tags) + TOC + prose wrapper
```

Always compose layouts from this chain. Do not skip levels.

### Content Collections

Blog posts live in `src/content/blog/` as `.md` files. The Zod schema in `src/content.config.ts` enforces:

```typescript
{
  title: string            // required
  description: string      // required
  pubDate: Date            // required (coerced)
  updatedDate?: Date       // optional
  tags: string[]           // default []
  draft: boolean           // default false — drafts are excluded from all listings
  image?: string           // optional OG image path
}
```

**Draft posts** (`draft: true`) must be filtered out in every listing. The pattern used is:

```typescript
const posts = await getCollection('blog', ({ data }) => !data.draft);
```

### Theming

- Theme state is stored in `localStorage` under the key `'theme'` (`'light'` | `'dark'`).
- The `<html>` element gets the class `dark` for dark mode; no class for light mode.
- An `is:inline` script in `BaseLayout.astro` runs synchronously before paint to prevent flash of wrong theme.
- CSS variables are defined in `src/styles/global.css` under `:root` (light) and `.dark` (dark).
- **Never use hard-coded colour hex values in components.** Always use the semantic CSS variable utility classes or Tailwind classes that reference the variables:
  - `bg-background`, `bg-card`, `bg-border`
  - `text-foreground`, `text-muted`, `text-accent`
  - `border-border`
  - Hover variants: `hover:text-accent`, `hover:bg-card`, `hover:border-border`

### Tailwind CSS v4

This project uses **Tailwind v4** via the Vite plugin (`@tailwindcss/vite`). Key differences from v3:

- No `tailwind.config.js` — configuration lives in `src/styles/global.css` using `@theme {}`.
- No `content` array — Tailwind v4 scans files automatically.
- Font is registered with `--font-sans` and `--font-mono` inside `@theme {}`.
- Typography plugin is loaded via `@plugin "@tailwindcss/typography"` in the CSS file.

Do not create a `tailwind.config.js` or `tailwind.config.ts`. All Tailwind customisation belongs in `src/styles/global.css`.

### Routing

All routes are statically generated at build time.

| Route | File | Notes |
|---|---|---|
| `/` | `src/pages/index.astro` | |
| `/blog` | `src/pages/blog/index.astro` | |
| `/blog/[slug]` | `src/pages/blog/[slug].astro` | Uses `getStaticPaths` |
| `/tags/[tag]` | `src/pages/tags/[tag].astro` | Uses `getStaticPaths` |
| `/rss.xml` | `src/pages/rss.xml.ts` | API endpoint |

When adding new dynamic routes, always implement `getStaticPaths` and export it.

### SEO

`src/components/SEO.astro` handles all meta tags (description, Open Graph, Twitter card, canonical URL). It accepts:

```typescript
{
  title: string
  description?: string
  image?: string        // resolved to absolute URL internally
  article?: boolean     // sets og:type = "article" for blog posts
}
```

Always pass `article={true}` in `BlogLayout`. Do not add ad-hoc `<meta>` tags directly in pages.

### Table of Contents

`TableOfContents.astro` auto-generates a TOC from Astro's `headings` array. It is shown only when a post has **5 or more h2/h3 headings** (controlled in `BlogLayout.astro`). Do not change this threshold without a clear reason.

### Reading Time

Computed via `getReadingTime(post.body)` in `src/lib/utils.ts` at 200 WPM. The `body` field is the raw markdown string from the content collection entry.

---

## Component Conventions

- All components are `.astro` files. Do not introduce React, Vue, or Svelte components unless the feature genuinely requires client-side interactivity that Astro cannot provide.
- Prop types are defined inline with a `interface Props {}` block in the frontmatter.
- Destructure props from `Astro.props`.
- Icon components live in `src/components/icons/` and render raw SVG. They accept `class` as a prop for sizing/colour overrides.
- Use `class` (not `className`) in Astro template markup.

---

## Data Files

### `src/data/site.ts`

Exports `siteConfig` — the single place for site name, title, description, URL, author, and social links. Import this instead of hard-coding any of these values.

### `src/data/experience.ts`

Exports an array of career experience objects consumed by `Timeline.astro`. Each entry has:

```typescript
{
  company: string
  role: string
  period: string        // e.g. "Nov 2025 - Present"
  description: string
  highlights: string[]
}
```

---

## Utility Functions (`src/lib/utils.ts`)

| Function | Signature | Purpose |
|---|---|---|
| `formatDate` | `(date: Date) => string` | "February 19, 2026" |
| `formatDateShort` | `(date: Date) => string` | "Feb 2026" |
| `slugify` | `(text: string) => string` | kebab-case for heading IDs |
| `cn` | `(...classes) => string` | conditional className combiner |
| `getReadingTime` | `(markdownBody: string) => string` | "3 min read" |

Do not duplicate these. Import from `../lib/utils` (adjust relative path as needed).

---

## Adding a Blog Post

1. Create `src/content/blog/<slug>.md`.
2. Add valid frontmatter conforming to the content schema above.
3. Write content in Markdown. Use `##` (h2) and `###` (h3) headings for structure — these feed the TOC.
4. Code blocks are syntax-highlighted with Shiki (`github-dark` theme); specify the language on fences.
5. Set `draft: true` to keep the post unpublished during authoring.
6. Tags should be lowercase, single-word or hyphenated strings (e.g. `engineering`, `product`, `startup`).
7. No image is required; omit the `image` field if unused.

---

## What Not To Do

- **Do not add npm packages** without a clear, necessary reason. Every dependency adds build complexity.
- **Do not use hard-coded colours** in components. Use CSS variable classes.
- **Do not create a `tailwind.config.js`** — Tailwind v4 does not use one.
- **Do not add client-side JavaScript** unless the feature cannot work without it. Astro defaults to zero JS.
- **Do not bypass the layout chain** (`BaseLayout → PageLayout → BlogLayout`).
- **Do not add `prose-invert` manually** in page markup; it is already in `BlogLayout`.
- **Do not import `siteConfig` data inline** in components — always import from `src/data/site.ts`.
- **Do not commit draft posts** with `draft: false` unless the content is ready to publish.
- **Do not add error boundaries, loading states, or suspense patterns** — this is a fully static site with no client data fetching.

---

## Code Style

- TypeScript strict mode is enabled. Do not use `any`.
- Prefer explicit types over inference for function signatures and component props.
- No trailing semicolons are enforced in `.ts`/`.astro` files (follow existing file conventions).
- Keep frontmatter blocks (`---`) concise; logic that can move to `src/lib/utils.ts` should.
- No console.log in committed code.

---

## Git & Deployment

- The `main` branch deploys automatically to Vercel.
- All work should be done on a feature branch and merged via PR.
- Commit messages follow conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`.
- `vercel.json` is present for Vercel configuration — do not delete or modify it without understanding its contents.

---

## Quick Reference: File to Edit for Common Tasks

| Task | File(s) to edit |
|---|---|
| Change site title / description | `src/data/site.ts` |
| Add a blog post | `src/content/blog/<slug>.md` |
| Add a nav link | `src/components/Nav.astro` |
| Add a social link | `src/data/site.ts` + `src/components/SocialLinks.astro` + `src/components/icons/` |
| Add a career entry | `src/data/experience.ts` |
| Change theme colours | `src/styles/global.css` (`:root` and `.dark` blocks) |
| Change font | `src/styles/global.css` (`@theme {}`) + update font import |
| Change TOC threshold | `src/layouts/BlogLayout.astro` (line 25) |
| Change reading speed | `src/lib/utils.ts` (`READING_WPM` constant) |
| Update SEO defaults | `src/components/SEO.astro` |
| Update RSS feed | `src/pages/rss.xml.ts` |
