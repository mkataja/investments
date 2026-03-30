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

## Not covered yet

- **Inline / table actions** (e.g. “Refresh”, “Remove”) often stay **text links** (`text-emerald-800` / `text-red-700` + underline) for density; migrate only when a screen needs consistency with primary controls.
- **Destructive** primary styling is undefined - use text-style danger or add a `variant` when needed.

## Conventions

- Prefer **reusing** `Button` / `ButtonLink` over copying Tailwind strings.
- New variants belong in `Button.tsx` with a clear name and a row in this table.
