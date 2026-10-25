# Queue Event Audit (read only)

This is a diagnostic tool for **Issue #1: one visible message becomes two queued deletions**.

The user reproduced `Queued=2` after sending one visible message in a server while `Servers only` was selected and the delay was 60 seconds. The normal AutoDelete script deduplicates equal message IDs, so the key question is whether Discord emits *different IDs* for preliminary and confirmed versions of one message.

## Safety

- This script never sends, edits, deletes, or searches messages, and does not retrieve a user token or make explicit network requests.
- It reads **only metadata** from newly observed messages sent by the current account: ID, channel ID, nonce, optimistic flag, state and type. It does not access their `content` or attachments.
- Actual message/channel IDs and nonce values are held in memory briefly to correlate events and **never included in the output**. The report uses session-specific aliases `M1`, `M2`, `N1`, `C1`.
- Reading internal Discord fields, even for diagnostics, is unsupported. **Review the code before pasting it into the browser console.**
- Existing Discord AutoDelete is a prohibited self-bot modification, with risk to the account. This audit is a technical observation only and does not confer permission to automate an account.

## Steps

1. **Pause AutoDelete and refresh Discord Web**, so the original deletion script is not running.
2. Enter a private, personal **test server channel** (or a consenting DM).
3. Open DevTools → Console and paste the contents of [queue-audit.js](./queue-audit.js).
4. You should see `[Queue Audit] Read-only watcher ready.`
5. Send **exactly one harmless test message**. No message will be deleted by the audit.
6. Run:
   ```js
   copy(JSON.stringify(DiscordQueueAudit.report(), null, 2))
   ```
7. Paste the copied report into your bug report or developer chat. No token, user ID, message text or channel ID is needed.
8. Run:
   ```js
   DiscordQueueAudit.stop()
   ```
   This detaches the listener, clears timers, and erases the temporary in-memory alias maps.

## Interpretation

- Two entries `source: flux` with `message: M1` and `message: M2` but the **same** `nonce: N1` indicate two different event IDs associated with the same client nonce. Optimistic → server-confirmed is a possible explanation.
- An entry from `flux` and one from `cache` for the **same** `M1` reflects the same observed message through two sources; the main script already deduplicates same-ID events.
- `optimistic: true` means the event reports its own optimistic flag. Some Discord builds may not supply this flag.
- Different nonce aliases, missing nonces, or other channel aliases do not by themselves establish a cause. Anomalies should not be assumed to be a single message without corroboration.
- The audit starts a baseline for the currently open channel, so it should not report historical messages.

## Automated checks

```sh
node --check diagnostics/queue-audit.js
node test/queue-audit.test.js
```

The mock test asserts that a pair of different message IDs sharing one nonce is correlated in the report **without exporting their raw IDs or message content**. Tests do not connect to live Discord.

**Related:** [Issue #1](../issues/1), [Issue #2 (HTTP 404/429 not counted)](../issues/2).
