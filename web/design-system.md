# Web design system (minimal)

This app uses **Tailwind CSS** with a small set of shared primitives. Extend here as patterns repeat.

## Primary control (`Button`, `ButtonLink`)

**Use for:** main actions in page headers and forms when the action should read as a **button** (not inline body text).

**Implementation:** [`src/components/Button.tsx`](src/components/Button.tsx)

| Export | Role |
| --- | --- |
| `Button` | `<button>` - defaults to `type="button"`; pass `type="submit"` in forms. |
| `ButtonLink` | React Router `<Link>` with the same surface styles (navigation that looks like the primary button). |
| `buttonPrimaryClassName` | Raw class string if you need the same look on another element (rare). |

**Visual:** white background, `emerald-200` border, `emerald-900` text, light shadow, hover fill `emerald-50`, visible focus ring. Disabled buttons use reduced opacity.

## Page layout spacing

**Stacking** uses flex column + gap so spacing is consistent (not ad-hoc `mb-*` on headings next to tables).

| Class | Role |
| --- | --- |
| `page-stack` | Top-level page vertical rhythm between major regions (same as `gap-6` / 1.5rem). |
| `page-section` | A major block with an `h2` and children (intro copy, charts, tables). Uses `gap-4` (1rem); direct `h2` margin is cleared so gap controls spacing. |
| `subsection-stack` | `h3` + block (table, chart). Uses `gap-3` (0.75rem); direct `h3` margin cleared. |

Use these on page roots and `<section>`s instead of mixing `space-y-*` with default heading margins for the same structure.

## Typography / headings

**Defaults:** `web/src/index.css` (`@layer base`) styles **`h1`–`h6`** so bare elements render without `className`. **Semantic sizes** mirror Tailwind’s `text-3xl` / `text-xl` / `text-base` / `text-sm` and live in **`web/tailwind.config.js`** as **`fontSize.heading-1`** … **`heading-4`** (use `text-heading-*` utilities when you need the same scale on a non-heading element).

| Level | Role |
| --- | --- |
| `h1` | Page title (`font-semibold`, slate-900) |
| `h2` | Major section (`font-medium`, slate-800, `mb-2`) |
| `h3` | Subsection / chart or table group (`font-medium`, slate-700, `mb-2`) |
| `h4`–`h6` | Smaller labels (`heading-4` text size) |

**Context styling:** Put scoped colors on **wrappers** when needed (e.g. **`[&_h3]:text-amber-950`** on a callout, **`[&_h2]:mb-0`** on a dialog header row). **Layout-only** utilities on headings are fine (**`shrink-0`**, **`min-w-0`**, etc.); avoid duplicating **typography** on **`h1`–`h6`**—use globals or **`text-heading-*`** on non-heading elements.

## Not covered yet

- **Inline / table actions** (e.g. “Refresh”, “Remove”) often stay **text links** (`text-emerald-800` / `text-red-700` + underline) for density; migrate only when a screen needs consistency with primary controls.
- **Destructive** primary styling is undefined - use text-style danger or add a `variant` when needed.

## Conventions

- Prefer **reusing** `Button` / `ButtonLink` over copying Tailwind strings.
- Prefer **bare** headings or headings with **layout-only** `className`; new variants belong in `Button.tsx` with a clear name and a row in this table.
