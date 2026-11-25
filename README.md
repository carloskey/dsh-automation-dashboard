# Task dashboard (`@local/dsh-automation-dashboard`)

A standalone sci-fi dashboard for the official DSH automation tasks. It adds a
**new** left-sidebar entry and its own `main` panel; the shipped **Automation
tasks** page keeps its registrations, its `schedules` panel key and its
`sidebar.panellist` entry untouched.

## Where it mounts

| Surface | Registration |
|:--|:--|
| Sidebar entry | `sidebar.panellist`, id `automation-dashboard`, order `20` |
| Page | `main`, key `automation-dashboard` |

The official page uses the key `schedules` at order `10`, so both entries sit in
the same list and either page can be opened without affecting the other.

## Data source

Only the official schedule service, through its existing Remote endpoints:

| Endpoint | Used for |
|:--|:--|
| `schedule/catalog` | every Host task: title, rule, `status`, committed `scheduledAt`, `executionActive`, `lastDelivery` |
| `schedule/history` | that task's saved delivery receipts (`scheduledAt`, `deliveredAt`, `targetSessionId`), limit 20, newest 16 tasks |
| `schedule/changed` | refresh when the Host catalog changes |

No task store, no cache file and no synthetic data: the plugin is read only and
adds no Host service. The entry is gated on `schedule/catalog` through
`ctx.remoteAccess.whenAccess`, so a Peer that may not read the catalog gets no
entry instead of a failing page.

## What the page computes

- **Status** — `executionActive` → running; `active` → waiting; `paused` →
  paused; `ended` → completed. The schedule service records no execution
  outcome for a delivery (a receipt only confirms the instruction reached the
  target inbox), so no failure state is shown; a one-line hint under the stats
  bar says so.
- **Fired today** — delivery receipts whose `deliveredAt` falls on today. When
  the catalog is larger than the 16 tasks whose history is read, the readout is
  prefixed with `≥` instead of reporting a partial count as a total.
- **On-time delivery** — share of today's receipts delivered within 60 s of
  their committed `scheduledAt`; receipts with an unreadable stamp are left out
  rather than counted as late.
- **Next run** — the earliest future `scheduledAt` among `active` tasks, with a
  one-second countdown.
- **Run log** — one horizontal lane per task, grouped by the window its rule
  calls for: intraday and daily rules read **today 00:00–24:00**, weekly and
  RRULE rules read **this month**, a one-shot reads its own day. The "now" scan
  line sweeps left to right; a point turns cyan as the line reaches it, green
  once a real receipt matches it, amber if it passed without one, and stays a
  hollow outline while it is still ahead. Hovering a point shows its time, state
  and delivery lag. Lanes with more than 120 occurrences collapse into one
  density band instead of drawing every dot.
- **Derived, not read** — the Host stores only each task's next committed
  occurrence, so future points are expanded from the stored rule around that
  anchor (cron, daily, weekly, every, and the RFC 5545 subset of RRULE that
  covers `FREQ=DAILY|WEEKLY|MONTHLY|YEARLY` with `INTERVAL`, `BYDAY`,
  `BYHOUR`, `BYMINUTE`, `BYMONTHDAY`, `BYMONTH` and `UNTIL`). An RRULE outside
  that subset — `COUNT`, `BYSETPOS`, `BYWEEKNO`, `BYYEARDAY`, ordinal `BYDAY` —
  falls back to the one official occurrence instead of guessing. A past point
  older than the oldest retained receipt is shown as **unconfirmed**, not as a
  missed run, because retention (30 days / 200 records) cannot prove it ran.
  Paused and ended tasks show real receipts only, because they will not fire
  again.
- **Task region** — exactly two rows of cards; further tasks scroll inside the
  region, with a bottom fade and a header hint that appear only when it
  overflows.

## Theme

The page follows the app theme: light is the base palette, and an ancestor
carrying `data-ds-dark-theme` swaps every colour through CSS variables — deep
space in dark, a light technical readout in light. Status hues stay the same in
both (teal / amber / green / magenta) but are darkened for contrast on light
surfaces, and glows are reduced to a hint.

## States

First load shows a reading block, never an "empty catalog" claim. A failed
first read shows the failure with **Retry**; a failed refresh keeps the last
data and says it is stale. Empty catalog and empty receipt placeholders appear
only after a successful read, and the empty catalog offers a button that opens
the official **Automation tasks** panel.

## Install

Requires DSH 0.2.x (developed and verified against `0.2.2-rc.5`).

From GitHub:

```sh
dsh plugin --profile web add github:carloskey/dsh-automation-dashboard
```

Then add the package to the profile's bundle list, otherwise its patch never
applies:

```jsonc
// ~/.dsh/profiles/web/package.json
"dsh": { "profile": { "bundles": [ ..., "@carloskey/dsh-automation-dashboard" ] } }
```

Or in the GUI: **Plugins → Add plugin → local directory**, pick the checkout.
Reload the page once; the entry appears in the left sidebar next to
Automation tasks.

No build step, no dependencies, no install script.
