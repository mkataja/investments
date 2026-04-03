# Web design system (minimal)

Tailwind with **`web/tailwind.config.js`** extending only **`heading-1`–`heading-4`**. Shared UI lives in **`web/src/css/`** (partial files; **`index.css`** imports them and runs `@tailwind`). **`typography.css`**: `@layer base` for `h1`–`h6`, `code`; named classes in the tables below use `@layer components` in the other partials. **Do not** define reusable Tailwind class lists as **`const`** strings in TypeScript — add a **named class** there with **`@apply`** instead. Prefer **globally reusable** names (role or appearance), not names tied to one feature or page — e.g. **`form-control`**, not **`transaction-modal-form-control`**. Merge with **`classNames`** from [`src/lib/css.ts`](src/lib/css.ts) when passing through **`className`**.

## `Button` / `ButtonLink`

[`src/components/Button.tsx`](src/components/Button.tsx) — outlined default. Use **`button-basic`** / **`button-cancel`** on raw `<Link>` / `<label>` when you cannot use those components (Cancel links, file browse label).

| Export | For |
| --- | --- |
| `Button` | Default outlined `<button>` |
| `ButtonLink` | Same surface as `<Link>` |

## Action & feedback (`web/src/css/`)

| Class | For |
| --- | --- |
| `nav-bar-link` / `nav-bar-link-active` / `nav-bar-indicator` | Top shell nav only (`App.tsx`) |
| `action-link` | In-page / back links (emerald text) |
| `button-basic` | Outlined default control |
| `button-cancel` | Outlined cancel (neutral) |
| `button-primary` | Filled submit or other primary action |
| `action-primary` | Primary action styled as link, not button |
| `action-delete` | Destructive action styled as link, not button |
| `banner-notice` | Success / info strip |
| `copy-success` | Positive inline message |
| `field-error` | Validation under a control |
| `error-alert` | [`ErrorAlert`](src/components/ErrorAlert.tsx) |
| `modal-close` | Modal dismiss |
| `txn-side-buy` / `txn-side-sell` | Buy vs sell amount styling |

## Page layout (`web/src/css/`)

| Class | For |
| --- | --- |
| `page-stack` | Page vertical rhythm |
| `page-section` | Section with heading + blocks |
| `subsection-stack` | `h3` + table/chart block |
| `page-header-stack` | Title row (back link, `h1`, meta) |
| `page-header-sticky` | Sticky title bar — combine with `page-header-stack` or a flex title row (`sticky`, border, `bg-slate-50`) |
| `page-subtabs` / `page-subtab` / `page-subtab-active` | Portfolio sub-tab row inside `page-header-sticky` with the Portfolio `h1` (`HomePage.tsx`) |
| `page-subtab-indicator` | Animated underline for portfolio sub-tabs — same transition as `nav-bar-indicator` (`navigation.css`) |
| `modal-stack` | Modal body |
| `modal-title` | Modal `h2` |
| `form-stack` | Compact stacked form |
| `field-note-stack` | Control + helper line |
| `form-control` | Default text inputs and selects in forms (neutral disabled styling) |
| `list-stack` | Stacked list blocks |

## Headings

Base styles in **`web/src/css/typography.css`**; sizes from **`text-heading-*`**. Use `fontSize` extend in **`web/tailwind.config.js`** for new levels.

## Not covered

Filled destructive button — add a class or `Button` variant when needed.

## Conventions

Reuse `Button` / `ButtonLink` and the classes above; new patterns go in **`web/src/css/`** (with **`@apply`**, not TS **`const`** class strings), use **global** class names, and add the relevant row to the table here.

