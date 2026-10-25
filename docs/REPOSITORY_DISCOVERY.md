# GitHub repository discovery and positioning

## Core positioning

**Discord AutoDelete — Self-Destructing Messages in Discord Web**

An experimental single-file JavaScript tool for **newly sent messages**: it attempts deletion after a customizable per-message expiry timer, with **independent DM and server delays**.

**Distinctive design:** live new-message observation, a floating on-page console dashboard, and reuse of existing authenticated Discord client actions **without explicitly extracting the user's token**.

This is different from bulk history cleaners such as [Undiscord](https://github.com/victornpb/undiscord), which search past messages and delete matching history. **Do not claim the first-ever disappearing-message tool**: other similar approaches exist, and the uniqueness of the exact feature combination is not globally verified.

## Suggested GitHub About description

Copy into the repository's **About** description field:

```text
Self-destructing-style messages for Discord Web: auto-delete NEW DMs and server messages by timer. JavaScript console, no token extraction. Unofficial.
```

*The About description is GitHub metadata separate from README.md. Editing README does not change this field.*

## Suggested GitHub Topics

```text
discord, javascript, discord-web, browser-console, auto-delete, message-deletion, disappearing-messages, self-destructing-messages, discord-selfbots
```

Use accurate topics rather than generic trending labels; avoid unrelated tags such as `discord-webhook` if the project does not implement webhooks.

The currently configured Topics may differ. Click the **gear next to About** on the repository page to add these; current GitHub connector access does not allow editing that repository metadata.

## Search phrases to serve naturally, not keyword-stuff

- Discord self-destructing messages
- Discord disappearing messages
- Auto-delete new Discord messages
- Discord DM message expiration timer
- Discord server auto-delete timer
- Discord Web browser console JavaScript
- Discord self-bot message deletion (with visible Discord policy warning)

README title, clear opening, honest screenshots, and useful docs are more important than repeating phrases.

## How to evaluate discoverability

- Search GitHub by exact repository name, then by phrases such as `discord self-destructing messages`.
- Compare results with similar projects, but do not equate being indexed with ranking highly.
- Review **Insights → Traffic** if available, including visitors, referrers, and clones.
- Google indexing can take time; results are not guaranteed or fully measurable from inside this repo.

## Safety and reliability claims to avoid

- **Do not claim guaranteed or instant deletion.** A 1-second timer starts after the script detects a confirmed new message. Browser scheduling and Discord/network responses can delay or prevent deletion.
- **Do not claim secure, private or end-to-end disappearing messages.** Other participants can preserve sent content.
- **Do not claim Discord approval or compliance.** Self-bot automation is prohibited by Discord.
- **Do not claim zero authorization.** The script uses the *already authenticated Discord client* but avoids explicit token extraction.
- **Do not claim every DM/server is always monitored.** Cache-only fallback covers only the open channel.
- **Do not claim all Requests succeeded.** The request counter measures calls, not verified completed deletions.

## License decision

The repository is public but its published files do not currently include a root `LICENSE`. Public visibility alone does not grant general reuse/redistribution permission. Choose an open-source license only when you are ready to authorize those rights.
