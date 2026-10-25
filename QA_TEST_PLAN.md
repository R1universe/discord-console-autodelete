# Manual QA Plan — Discord AutoDelete v3.3

**Status:** One successful deletion was reported by the user in a live Discord Web session on October 25, 2026. The remaining cases have **not** been independently verified.

**Scope:** Voluntary, low-volume checks on a personal test server or with consenting DM participants. All tests use harmless content. Do not stress-test Discord's API, spam, send bulk messages, or use private conversations without permission.

**Risk:** This console script automates a normal Discord user account in a way Discord prohibits, with possible account sanctions. It may delete messages irreversibly. Results should be treated as experimental.

## Read this first

- Read the JavaScript source before running it. Never share a Discord account token, cookie or Authorization header.
- Close unrelated sensitive chats and use a test channel.
- After clicking **Pause** or closing the overlay, all pending timers are cancelled; after a refresh, the script and its pending queue disappear.
- The UI's **Requests** counter means a deletion method completed without throwing. It is **not** independent proof that Discord removed a message.
- **Open-channel cache fallback** can miss events while switching channels or with the browser tab in the background.
- To avoid surprise deletion, use a non-default scope until you understand how it behaves.
- Record observed deletion time to the nearest second if practical; tiny deviations are expected, especially for background tabs.

## P0 — functionality and safety

| Test | Procedure | Expected result | Result |
| --- | --- | --- | --- |
| F01 One message | Set delay 10s, enable, send `test-01` in a test channel | Your own message disappears approximately 10s later | NOT TESTED |
| F02 Three messages | Send 3 harmless messages several seconds apart | Each gets an independent timer; no duplicate deletion requests | NOT TESTED |
| F03 Pausing | Set 30s; send `test-pause`; immediately press Pause | Pending queue clears and this message remains even after 30s | NOT TESTED |
| F04 Delay changed mid-queue | Set 30s, send A; change delay to 5s, send B | B should disappear around 5s after B; A retains the original ~30s deadline | NOT TESTED |
| F05 Other people's messages | With a consenting collaborator in a test channel, let them post | Their messages must NEVER be deleted by this tool | NOT TESTED |
| F06 Stop | Set 30s, send A, click × | UI disappears and A stays; no more automatic deletions | NOT TESTED |
| F07 Duplicate events | Observe counters after a single message | One scheduled job and at most one deletion attempt per message | NOT TESTED |

## P1 — scope and reliability

| Test | Procedure | Expected result | Result |
| --- | --- | --- | --- |
| S01 Servers only | Select Servers only; test in a server then in a consenting DM | Delete only server messages | NOT TESTED |
| S02 DMs only | Select DMs only; test in a consenting DM then in your server | Delete only DM messages | NOT TESTED |
| S03 All | Select Everywhere; test in one permitted server and consenting DM | Both are eligible for deletion | NOT TESTED |
| S04 Channel switching | Start timer in channel A, navigate to B | Pending message A still gets deleted if timer is active | NOT TESTED |
| S05 Browser refresh | Set 60s, send A, refresh BEFORE timer ends | Queue does not persist; A remains after reload (KNOWN LIMITATION) | NOT TESTED |
| S06 Background tab | Start timer, switch to another browser tab temporarily | Observe whether timer is delayed by browser throttling | NOT TESTED |
| S07 Reconnect after pause | Pause, use Reconnect, then manually enable again | Fresh module discovery, no old pending deletions revived | NOT TESTED |
| S08 Emoji / attachment / reply | Send individually in a test channel if desired | Own supported message types are deleted; record exceptions | NOT TESTED |
| S09 Own message edited before deletion | Edit a harmless message during the countdown | The intended same message is deleted once, or failure is clearly reported | NOT TESTED |

## P2 — diagnostics and polish (no network stress tests)

| Test | Procedure | Expected result | Result |
| --- | --- | --- | --- |
| R01 UI interactions | Move/minimize/open panel; adjust delay and scope | No crash, controls remain readable | NOT TESTED |
| R02 Idle stability | Leave enabled, idle for 10–15 min in a test channel | No unexpected deletion, excess logging, or accumulating queue | NOT TESTED |
| R03 Error reporting | If a genuine failure occurs, record sanitized error text | Helpful message without secrets | NOT TESTED |
| R04 Reload behavior | Reload Discord and run only the script again | Settings remembered; auto-delete starts **paused**, never enabled | NOT TESTED |

## Known gaps observed in current source

1. The script stores timer jobs only in memory. Refresh/close loses them.
2. The fallback polls `MessageStore` for the **selected** channel, not every channel.
3. `requests` is NOT equivalent to confirmed server-side deletions; it is incremented when an internal promise resolves.
4. Scope filtering uses internal channel metadata and can skip items whose type cannot be safely determined.
5. The `processed` set caps at 5,000 IDs; handling many messages over a long period is not tested.
6. The UI does not expose a secure persistence/recovery mechanism or an explicit confirmation of Discord's HTTP status.
7. Updates to Discord's client may change internal API behavior without notice.

## How to record findings

For each failed or uncertain case, provide:

```text
Version: v3.3
Case ID:
Where: test server / consenting DM
Delay setting:
Scope setting:
Expected:
Actual:
UI: Queued / Requests / Errors:
Relevant sanitized Activity Log message:
```

**Do not include message contents, user/channel IDs, account tokens, cookies, headers or personal conversation screenshots.**

## Definition of ready for a stable beta

- All P0 cases pass.
- Server and DM scopes behave correctly in the test environments used.
- Known limitations are documented clearly.
- Failed API calls are surfaced rather than counted as successful deletion.
- No accidental deletions outside selected scope.
- At least one brief idle/stability test passes.
- GitHub Actions passes syntax + mocked regression tests.

This checklist is manual QA. Existing GitHub Actions tests use simulated clients, not a real Discord integration.
