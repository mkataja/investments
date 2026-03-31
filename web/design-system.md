# Web design system (minimal)

Tailwind CSS with a small set of shared primitives. Extend here as patterns repeat.

## Primary control (`Button`, `ButtonLink`)

Use for main actions in page headers and forms when the control should read as a button (not inline body text).

Implementation: [`src/components/Button.tsx`](src/components/Button.tsx)

| Export | Role |
| --- | --- |
| `Button` | `<button>` — default `type="button"`; pass `type="submit"` in forms |
| `ButtonLink` | React Router `<Link>` with the same surface styles |
| `buttonPrimaryClassName` | Raw class string for rare non-button elements |

Visual: white background, `emerald-200` border, `emerald-900` text, light shadow, hover `emerald-50`, visible focus ring. Disabled: reduced opacity.

## Page layout spacing

Stack with flex column + gap (avoid ad-hoc `mb-*` on headings next to tables).

| Class | Role |
| --- | --- |
| `page-stack` | Top-level vertical rhythm (`gap-6`); long forms between major steps |
| `page-section` | Major block: `h2`/`h3` + children (`gap-4`; direct `h2`/`h3` margins cleared) |
| `subsection-stack` | `h3` + table/chart (`gap-3`) |
| `page-header-stack` | Title area: back link, `h1`, subtitle, errors (`gap-2`) |
| `modal-stack` | `Modal` body (`gap-4`) |
| `form-stack` | Compact vertical forms (`gap-3`) |
| `field-note-stack` | Control + helper (`gap-1`) |
| `list-stack` | Vertical blocks (`gap-3`) |

Use on page roots and `<section>`s instead of mixing `space-y-*` with default heading margins. Dense lists may keep local `space-y-0.5`.

## Typography / headings

Defaults: `web/src/index.css` (`@layer base`) styles `h1`–`h6` without requiring `className`. Semantic sizes mirror Tailwind `text-3xl` / `text-xl` / `text-base` / `text-sm` and live in `web/tailwind.config.js` as `fontSize.heading-1` … `heading-4` — use `text-heading-*` on non-heading elements when needed.

| Level | Role |
| --- | --- |
| `h1` | Page title (`font-semibold`, slate-900) |
| `h2` | Major section (`font-medium`, slate-800, `mb-2`) |
| `h3` | Subsection / chart or table group (`font-medium`, slate-700, `mb-2`) |
| `h4`–`h6` | Smaller labels (`heading-4` size) |

Scoped colors on wrappers when needed (e.g. `[&_h3]:text-amber-950`, `[&_h2]:mb-0` in dialog header). Layout-only utilities on headings (`shrink-0`, `min-w-0`) are fine; avoid duplicating typography on `h1`–`h6` — use globals or `text-heading-*`.

## Not covered yet

- Inline/table actions (“Refresh”, “Remove”) often stay text links (`text-emerald-800` / `text-red-700` + underline); migrate when a screen needs primary-button consistency.
- Destructive primary styling undefined — use text-style danger or add a `variant` when needed.

## Conventions

- Prefer reusing `Button` / `ButtonLink` over copying Tailwind strings.
- Prefer bare headings or `className` with layout-only utilities; new variants belong in `Button.tsx` with a name and a row in this table.
