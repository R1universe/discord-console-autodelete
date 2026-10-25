# AutoDelete v3.12 — Apple × Discord glass specification

## Direction

Use the two user-selected conceptual mockups as the visual target: **cool blurple liquid-glass while disabled**, and **green/emerald liquid-glass while enabled**. The production panel is a functional browser-console overlay, not a pixel-for-pixel rendering of a generated image. It should remain readable over varying Discord conversations and backgrounds.

## Components and behavior

| Part | Visual treatment | Behavior |
| --- | --- | --- |
| Floating frame | Translucent blue-graphite / green-graphite layered gradient, frosted backdrop, fine light rim, ~24px radius | Fixed draggable Discord overlay, content scrolls if viewport short |
| Header | Embossed glass clock tile, concise AutoDelete + version, compact minimize / close controls | No subtitle and no help button |
| Primary CTA | Broad glass capsule, cold blurple when disabled, mint green when enabled | Enable / Disable; Disable clears pending queue |
| Scope switch | Three connected glass segments with luminous selected state | Everywhere / Servers / DMs; selected item controls visibility of timing rows |
| DMs + Server delays | Three equal-width glass cells | Free text input 1–86400 seconds; 4s preset; 60s preset |
| Statistics | Three equally balanced translucent cards with **no icons** | Queued (timers), Requests (attempted calls), Errors (caught failures) |
| Diagnostics | Compact frosted disclosure with log and reconnect | Collapsed by default, remains keyboard accessible |

## Color and optical treatment

| Token | Disabled | Enabled |
| --- | --- | --- |
| Frame background | translucent midnight-blue / graphite | translucent emerald-blue / graphite |
| Outer hairline | `#d6e0ff75` | `#90ffd1b3` |
| Ambient glow | cool `#7288ff21` | emerald `#40ffb94d` |
| Glass blur | `blur(28px) saturate(165%)` | same |
| Brand tile | cobalt / soft lavender | green / jade |
| Selected scope | periwinkle glow | mint green glow |
| Metric cards | slate / blue translucency | green / graphite translucency |

Note that colors use alpha transparency; the actual appearance is influenced by the content behind the overlay.

## Layout

```text
╭──────────────────────────────────────╮
│ ◷  AutoDelete v3.12              − × │
├──────────────────────────────────────┤
│ [               Enable             ]│
│                                      │
│ Where to delete  Your messages only │
│ [ Everywhere | Servers | DMs ]       │
│                                      │
│ DMs · deletion delay         1s–24h  │
│ [ 10 custom ] [ 4s ] [ 60s ]         │
│                                      │
│ Servers · deletion delay     1s–24h  │
│ [ 10 custom ] [ 4s ] [ 60s ]         │
│                                      │
│ [ 0 Queued ] [0 Requests] [0 Errors] │
├──────────────────────────────────────┤
│ Diagnostics                       ⌄  │
╰──────────────────────────────────────╯
```

In Servers-only / DMs-only scope, hide only the irrelevant timing row while preserving its saved value.

## Timing and safety

The **1s minimum is a browser timer floor**, not a promise of confirmed server-side removal in 1 second. Time begins when a confirmed message is observed; server and browser load, asynchronous operations, network responses, and rate limits add uncertainty. The Requests counter is not Deleted. The Errors counter does not necessarily see background HTTP failures.

This is unsupported self-bot automation on a normal Discord account, contrary to Discord's rules. This redesign does not make it official or compliant. Do not extract account credentials, log message text, or add bulk activity.

## Regression gate

- Verify source parses in Node and mock runtime integration tests pass.
- No icons are present in the metrics markup, and CSS explicitly suppresses decorative metric icons.
- Verify both DM and server delay `1` settings create a 1000ms pending timer in mocked clients; `0` must be rejected.
- Validate style tokens for both themes, selected presets/scope and reduced-motion behavior.
- Manually inspect actual translucency, contrast, keyboard navigation and layout in Discord Web.

Live Discord behavior is **not** established by a mocked GitHub Actions run.
