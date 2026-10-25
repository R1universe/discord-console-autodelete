# Manual QA Plan — Discord AutoDelete v3.9

**Status (October 25, 2026):** The user completed nine initial behavior tests on **v3.3**, then reproduced `Queued=2` for one visible message. The read-only queue diagnostic showed **M2 (temporary, SENDING, id=nonce) and M3 (confirmed server ID, SENT) sharing nonce N1**. v3.4 rejects M2 and schedules only M3 in mocked regression tests, but **has not been retested live**. HTTP 404/429 and limited observability remain [Issue #2](https://github.com/R1universe/discord-console-autodelete/issues/2).

**Scope:** Voluntary, low-volume checks on a personal test server or with consenting DM participants. All tests use harmless content. Do not stress-test Discord's API, spam, send bulk messages, or use private conversations without permission.

**Risk:** This console script automates a normal Discord user account in a way Discord prohibits, with possible account sanctions. It may delete messages irreversibly. Results should be treated as experimental.

## Read this first

- Read the JavaScript source before running it. Never share a Discord account token, cookie or Authorization header.
- Close unrelated sensitive chats and use a test channel.
- After clicking **Pause** or closing the overlay, all pending timers are cancelled; after a refresh, the script and its pending queue disappear.
- v3.4 labels counters **Attempts** (delete method invocations) and **Caught** (failures visible through the call/promise); neither is proof of complete server deletion or all background HTTP errors.
- **Open-channel cache fallback** can miss events while switching channels or with the browser tab in the background.
- To avoid surprise deletion, use a non-default scope until you understand how it behaves.
- Record observed deletion time to the nearest second if practical; tiny deviations are expected, especially for background tabs.

## v3.9 contextual timer visibility (no message sending needed)

1. Refresh Discord Web, inspect and run `autodelete.js`. Verify the header says **v3.9** and primary control says **Enable**.
2. Confirm **Where to delete** is immediately below Enable and the timers appear beneath scope.
3. With **Everywhere** selected, both **DMs · deletion delay** (first) and **Servers · deletion delay** (second) are visible.
4. Set DM delay to 27 and Server delay to 45; switch to **DMs**. Only the DM delay must remain visible.
5. Switch to **Servers**. Only the server delay must be visible, and it must still show 45.
6. Switch to **Everywhere**. Both timers return with DM 27 and Server 45 unchanged.
7. Click **Enable**. Confirm the theme turns green and the button reads **Disable**.
8. Click **Disable**. Confirm black/neutral theme returns and any pending timers are cancelled.
9. Check `DiscordAutoDelete.status()` to confirm both independent delay values and selected scope remain accurate. Reloading should leave the script disabled by default.

No actual message deletion is required for these layout tests. Discord's restrictions and the pre-existing HTTP error-reporting limitation still apply.

## v3.8 quick UI verification (no message deletion necessary)

1. Refresh Discord Web and run the reviewed [autodelete.js](./autodelete.js). Check the title **v3.8**.
2. The **Enable auto-delete** button must appear above **DMs** and **Servers** timers.
3. Confirm the old **ACTIVE/PAUSED + LOCAL** header strip and `Queue empty` line are absent.
4. Check **Where to delete** displays three buttons: Everywhere, Servers, DMs. Try all three; the selected button changes, and `DiscordAutoDelete.status().scope` reflects it.
5. Before enabling, confirm the panel is near-black and the selected control is muted blue. Enable using the top button: panel border/glow, main action and selected scope button should turn **subtle green**.
6. Press **Pause · clear queue**: the green treatment must disappear and the panel must return to dark neutral. No message needs to be sent.
7. Check that numeric DM/Server inputs still accept free typing and presets still work.
8. Open **Diagnostics & safety** and confirm the risk statement remains accessible. Module connection errors must still display outside Diagnostics.
9. Check the layout in a narrow browser viewport, including focus rings on segmented buttons.

The code's deletion mechanism and internal monitoring were not intentionally changed. This is a user-interface smoke test, **not proof of complete live deletion reliability**.

## v3.7 manual custom-input check (no messages need to be sent)

1. Refresh Discord Web, run the reviewed `autodelete.js` and verify the panel says **v3.7**.
2. Confirm **DMs** appears above **Servers**.
3. Click the DM numeric field, `Cmd+A` / `Ctrl+A`, and type `125` slowly, pausing over 0.5s between digits. The value must **not** reset while typing.
4. Press Enter; the value should save and remain `125`, including after refreshing the panel.
5. Type `42` in Servers, then click outside; it should save separately.
6. Attempt to commit `1` or a non-number; the previous valid setting should return with an informative log entry.
7. Type `88` without committing, press Escape and verify the previous value is restored.
8. Confirm presets still work, and neither timer is enabled automatically.

Existing deletion logic is unchanged. No messages or network requests are required for this UI regression test.

## v3.6 focused UI verification (no messages need to be sent)

1. Reload Discord Web, inspect the updated [autodelete.js](./autodelete.js), and paste the complete script into the browser console.
2. Confirm the header says `v3.6`. The dark panel should show both separate delay settings, Scope, Enable/Pause, three counters and a small queue line **without the old introductory paragraph or large warning banner**.
3. Confirm `Diagnostics & safety` starts **closed**. Click its label, then close it; click `?` in the header and verify it opens again.
4. Confirm the detailed self-bot risk warning, caveat that Attempts is not a confirmed delete count, Activity Log and `Reconnect modules` are present inside Diagnostics.
5. Inspect the compact panel with a narrow browser window. Ensure the body scrolls if Diagnostics is expanded and actions remain usable.
6. Confirm that existing delay values persist, and that enabling monitoring is **still manual**.
7. If the client reports an actual connection failure, confirm that failure remains visible even while Diagnostics is collapsed; do not trigger a failure intentionally.
8. If cache-only fallback is used, confirm a concise `Limited coverage: current channel only` notice is visible.

No message deletion or account-token information is needed for this visual QA. This is a layout change; previously observed Discord API 404/429 issues remain open.

## v3.5 focused verification — separate delays

This version changes scheduling rules; **its compatibility with the live Discord client is not yet verified**.

1. Refresh Discord Web to unload previous scripts. Run the reviewed v3.5 code.
2. In the panel choose **Everywhere**; set **Servers = 60 seconds**, **DMs = 10 seconds**. Start paused.
3. Enable AutoDelete and send **one harmless message in your own test server channel**. Expected one job (`Queued=1`) with ~60s until deletion. Press Pause before it fires.
4. Resume in a consenting DM, send **one harmless test message**. Expected one job with the 10s delay, then pause to cancel if desired.
5. Check the changed labels and `DiscordAutoDelete.status()`: `serverDelaySeconds=60`, `dmDelaySeconds=10`.
6. Check saving settings over reload and the initial **PAUSED** state. Changing either setting must not recalculate existing pending timers.

Never share message content, channel IDs, or authentication data. Respect existing 404/429 issues, and avoid unnecessary DELETE requests.

## v3.4 focused verification — one message, no deletion required

1. Refresh Discord Web to unload older scripts. Review [autodelete.js](./autodelete.js) before running.
2. In your own test server select `Servers only` and `60 seconds`.
3. Enable AutoDelete and send exactly one harmless message.
4. The expected immediate `Queued` value is **1**, not 2; there should be only one scheduling log line.
5. Press **Pause** before 60 seconds. `Queued` should fall to **0** and the message should remain.
6. Record PASS/FAIL and any sanitized Activity Log observations. This tests queue scheduling without more Discord DELETE requests.

**Do not mark issue #1 resolved until this is observed in the real client.** A later separate low-volume actual delete test can validate the confirmed ID is deleted if appropriate; respect Discord rate limits.

## Actual manual test observations — 2026-10-25

| Initial chat test | User result | Evidence / qualification |
| --- | --- | --- |
| 1. Single message / 10s | PASS with anomaly | Message reportedly deleted, but **Queued=2** and two scheduling log lines for one visible outgoing message. Issue #1. |
| 2. Three messages | PASS (reported) | No screenshot provided. |
| 3. Pause cancels queued deletion | PASS | Screenshot after pause shows Queued=0; user confirms message remained. |
| 4. Changing delay | PASS (reported) | No screenshot. |
| 5. Server vs DM scopes | PASS (reported) | No screenshot. |
| 6. Switching channels | PASS (reported) | No screenshot. |
| 7. Other user's message protected | PASS (reported) | No screenshot. |
| 8. Page reload | PASS (reported) | No screenshot. |
| 9. Background tab | PASS (reported) | No screenshot. |

**Cross-cutting issue:** Console shows rejected Discord `DELETE` HTTP requests (404), even when Activity Log says “Delete request completed” and `Errors` stays 0. Issue #2. Existing counts **do not demonstrate 100% successful deletion**. We should distinguish *observed outcome* from *reported internal call success*.

**Release gate:** Do not call v3.3 a stable release until these two issues are diagnosed and verified, preferably using a single quiet test channel with consent and *no token or private-message logging*.

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
