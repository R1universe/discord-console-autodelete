# Discord AutoDelete v3.8 — UX/UI specification

## Design goal

A **near-black, quiet utility panel** when paused, with a **restrained dark-green visual signal** while monitoring is enabled. Keep primary actions at the top, remove meaningless text duplication, and make “where to delete” a fast segmented choice instead of a dropdown.

## Default layout

```text
╭────────────────────────────────────────╮
│ ◷ AutoDelete v3.8               ?  −  × │
│   Timed Discord messages               │
├────────────────────────────────────────┤
│ [         Enable auto-delete         ] │  ← First action
│                                        │
│ DMs · deletion delay            2s–24h │
│ [  2   ] [5s] [10s] [30s] [60s]      │
│                                        │
│ Servers · deletion delay        2s–24h │
│ [ 10   ] [5s] [10s] [30s] [60s]      │
│                                        │
│ Where to delete                        │
│ [ Everywhere ] [ Servers ] [ DMs ]     │
│                                        │
│ [ Queued ] [ Attempts ] [ Caught ]     │
├────────────────────────────────────────┤
│ Diagnostics & safety               ⌄   │
╰────────────────────────────────────────╯
```

There is **no separate ACTIVE/PAUSED/LOCAL status strip** and **no empty-queue helper line**. Button copy plus panel theme convey monitoring status. Version remains visible next to the title. Error or limited coverage messages can still appear prominently when relevant.

## New interaction model

| Interaction | Visual/UI result | Data effect |
| --- | --- | --- |
| Launch, paused | Matte near-black, subtle blue selected scope and preset | Auto-delete remains disabled by default |
| Enable | Dark green panel tint, green border/glow, green primary button, green selected controls | Call existing `resume()` |
| Pause | Return to near-black; restore muted blue selection | Call existing `pause()` and cancel pending timers |
| Select Everywhere | Mark first scope button pressed | Persist `scope=all` |
| Select Servers | Mark second scope button pressed | Persist `scope=servers` |
| Select DMs | Mark third scope button pressed | Persist `scope=dm` |
| Reconnect failed | Visible `role=alert` in main body | Backend remains disabled |
| Limited open-channel fallback | Small visible limited-coverage line | No change to backend |
| Open Diagnostics & safety | Show policy warning, log, reconnection and metric caveat | Does not change auto-delete state |

Each scope button has `type=button`, lives in a `role=group` with an accessible label, and uses `aria-pressed=true/false` to indicate its selection. Native buttons are keyboard-operable.

## Colors

| Surface | Paused | Active |
| --- | --- | --- |
| Panel background | `#101113` | `#101714` |
| Header | `#151719` | `#132119` |
| Main accent | `#6773ec` | `#299b68` |
| Hover accent | `#7a84f6` | `#32ad77` |
| Panel border | `#303439` | `#2e7d57` |
| Selected scope | `#272c44` | `#19372a` |
| Stat card | `#191c1f` | `#15221b` |

White and gray text remain legible; green is used only as a state/selection cue, never an overwhelming saturated background. Transitions are 200ms and disabled for `prefers-reduced-motion: reduce`.

## What was removed from the default layout

- Legacy native `<select id="ad-scope">`: replaced by three buttons.
- Status row with `ACTIVE/PAUSED` and `LOCAL vX`.
- “Queue empty” and “Next deletion in …” helper row.

## What was retained

- DM-first ordering and reliable custom time typing from v3.7.
- Server/DM independent delays and scope filters.
- Message confirmation/nonce deduplication and the existing deletion implementation.
- Three counters: Queued (pending jobs), Attempts (invocations), Caught (surfaced failures).
- Diagnostics with warning and activity logs, plus visible connection errors and limited-coverage warnings.
- Floating/minimized modes, panel dragging and `DiscordAutoDelete.status()` command.
- No token extraction, user content logging, or external code fetching.

## Validation

GitHub Actions' mocked tests check: button ordering, selected-scope state/ARIA attributes, theme entering/leaving ACTIVE, no old status/queue strings, accessible diagnostics, and existing scheduling/configuration behavior. Real appearance and account behavior must still be verified manually in Discord Web. Discord prohibits self-bots and may sanction accounts.
