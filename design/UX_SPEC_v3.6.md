# AutoDelete v3.6 — UX/UI redesign specification

**Status:** Implemented in [`autodelete.js`](../autodelete.js), 26 October 2026. The application remains an unsupported Discord client modification; it is not an official or verified integration.

## Design objective

Make AutoDelete feel like a **compact native Discord utility**, not a development console. The primary view should answer four questions without scrolling:
1. Is it active or paused?
2. What is the server delay?
3. What is the DM delay?
4. Can I enable, pause, or inspect the queue?

Keep detailed diagnostics *available but opt-in*. **Do not conceal hard failures or the account risk**: use a visible error banner for connection failures, a compact limitation notice for cache-only mode, and a clearly labeled `Diagnostics & safety` disclosure in the footer.

## Before → after

| v3.5 | v3.6 |
| --- | --- |
| Blue/purple gradient header | Flat graphite header with a single muted Discord-blurple accent |
| Introductory paragraph below status | Removed |
| Large amber self-bot warning in main view | Warning and irreversible-operation caveats in Diagnostics & safety |
| Explanation beneath queue statistics | Detailed counter semantics in Diagnostics & safety |
| Always-visible Activity Log | Activity Log collapsed by default |
| Separate Reconnect/footer labels | Single Diagnostics & safety disclosure containing reconnect |
| No direct safety shortcut | `?` in header expands Diagnostics & safety |
| Large, visually loud panel | Compact controls, restrained borders, less decorative chrome |

## Screen hierarchy

```text
┌─────────────────────────────────────────────┐
│ ◷ AutoDelete v3.6                      ? − × │
│   Timed Discord messages                   │
│ ● PAUSED                            LOCAL   │
├─────────────────────────────────────────────┤
│ Servers · deletion delay          2s–24h   │
│ [  10   ] [5s] [10s] [30s] [60s]          │
│                                             │
│ DMs · deletion delay              2s–24h   │
│ [  60   ] [5s] [10s] [30s] [60s]          │
│                                             │
│ Where to delete            Your messages   │
│ [ Everywhere: servers and DMs           ▾ ]│
│                                             │
│ [         Enable auto-delete             ] │
│                                             │
│ [  0 Queued  ] [ 0 Attempts ] [ 0 Caught ] │
│                Queue empty                 │
├─────────────────────────────────────────────┤
│ Diagnostics & safety                      ⌄ │
└─────────────────────────────────────────────┘
```

Expanded footer:
```text
│ Diagnostics & safety                      ⌃ │
│ Unofficial account automation...           │
│ Attempts ≠ confirmed deletions...          │
│ ACTIVITY LOG                               │
│ timestamp · event                          │
│ [             Reconnect modules           ]│
```

**Connection ERROR exception:** Show compact `role=alert` block in the primary view because the primary action cannot run. **Cache-only exception:** show one short “Limited coverage: current channel only” line.

## Color tokens

| Role | Hex | Usage |
| --- | --- | --- |
| Background | `#1e1f22` | Main panel |
| Header and footer | `#232428` | Chrome |
| Surface | `#292b30` | Inputs/preset controls |
| Hover surface | `#313338` | Hover states |
| Border | `#3a3d44` | Divider/outer border |
| Foreground | `#f2f3f5` | Primary text |
| Secondary text | `#b5bac1` | Descriptions |
| Muted | `#949ba4` | Hints / technical details |
| Primary | `#5865f2` | CTA and focus/selection |
| Primary hover | `#6875f5` | CTA hovered |
| Active | `#43b581` | Status indicator only |
| Paused | `#d9ab57` | Status indicator only |
| Error | `#ed6a6a` | Error indicator and error panel |

The palette avoids bright gradients, large warning fills, and multiple competing accents. The entire visual system uses **one primary interactive accent**.

## Sizes / spacing

- Panel width: **370px**, responsive max-width `calc(100vw - 24px)`.
- Maximum height: `calc(100vh - 110px)`, scrollable when Diagnostics is expanded on shorter screens.
- Corners: **14px outer**, 8px buttons / controls.
- Main padding: **16px**.
- Header title: **15px**; labels 12px; hints 10px.
- Two delay rows at default desktop width; no separate field helper paragraphs.
- 3-column metrics row, simple queue status.
- Native `<details><summary>` disclosure, keyboard accessible and collapsed by default.

## Interactions

| Action | Expected |
| --- | --- |
| Toggle Enabled/Paused | Same backend behavior as v3.5; Pause clears queue |
| Server/DM preset | Changes only its corresponding delay; previously scheduled jobs remain unchanged |
| Scope selection | Servers / DMs / all, preserving existing backend validation |
| Help `?` | Opens the `Diagnostics & safety` section; no new windows |
| Diagnostics disclosure | Opens/closes via click or keyboard using native details/summary |
| Reconnect modules | Calls the existing re-discovery logic and cancels queue as before |
| Minimize | Existing pill mechanism |
| Close | Existing unsubscribe/cleanup logic |
| Connection error | Visible immediately as a concise alert, not buried in details |
| Cache-only monitoring | Visible immediately as a brief limited-coverage label |

## Safety and trust constraints

- Never imply that “Attempts” are confirmed deletions.
- Do not present “Caught=0” as proof that no background HTTP errors occurred.
- Keep accessible, discoverable risk wording: **Discord prohibits self-bot automation and may restrict or terminate accounts**.
- No new token access, network calls, message-content logging, or changing message deletion implementation.
- All controls remain opt-in; successful module discovery never auto-enables deletion.

## QA / release gate

- [ ] Verify v3.6 syntax and existing mocked scheduling tests in GitHub Actions.
- [ ] Verify the safety disclosure can be opened with the `?` control.
- [ ] Verify `role=alert` connection error remains visible with details closed.
- [ ] Verify compact panel starts with `Diagnostics & safety` collapsed.
- [ ] Verify both independent delays persist correctly.
- [ ] Manually inspect layout in Discord Web at ordinary and narrow browser widths.
- [ ] Manually inspect the expanded Diagnostics section when the viewport is short.
- [ ] Confirm no changes to live Discord behavior or deletion outcomes; v3.6 is predominantly presentation-only.

## Implementation

Single-source CSS and markup are embedded in [`autodelete.js`](../autodelete.js), keeping the copy/paste console workflow unchanged. The browser client's Shadow DOM prevents most Discord CSS conflicts. The original v3.5 server/DM delay, message-discovery, event-subscription, queue and deletion logic is retained.

**Known limitation:** styling has been validated against static mock-backed tests and source checks, not visually tested on the user's exact Discord browser build. Browser appearance may differ slightly by OS and browser.
