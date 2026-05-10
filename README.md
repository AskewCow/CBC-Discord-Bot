# CBC Discord Bot

A Discord bot built for the **Claude Builder Club** at Trinity College Dublin. It automates committee tasks, organises the server, and keeps everything logged for full transparency.

> Built by the CBC Ambassador at TCD. Full documentation is available in the [GitHub Wiki](../../wiki).

---

## Features

### Server Administration
- **Setup system** — Configure channels, categories, and roles the bot uses via `/setup-*` commands
- **Formatted announcements** — Post styled club messages (announcements, reminders, shoutouts, resources) with `/format-message`
- **Ticket system** — Create a support panel with custom categories and automated message flows for common questions

### Events
- **Event creation** — Post events (workshops, hackathons, research salons, committee meetings, tabling) with registration buttons, auto-generated threads, and optional pings
- **Event cancellation** — Cancel events and automatically DM all registered participants
- **Onboarding flows** — Welcome new members with a custom DM or a guided question form on join

### Community
- **Invite tracking** — Track who invited who and surface active invite counts with `/invites`
- **Invite leaderboard** — Live-updating top 10 leaderboard with toggles for scope and committee inclusion
- **Project showcase** — Members can submit projects via `/submit-project`; submissions are posted with voting buttons and filtered by tool used

### Transparency & Logging
Every significant action (setup changes, event creation/deletion, project submissions, leaderboard generation) is posted to a configured mod log channel. Member joins, leaves, and invite usage are all tracked in the database.

---

## Quick Setup

**Prerequisites:** Node.js 18+, a Discord application with a bot token.

```bash
git clone https://github.com/AskewCow/CBC-Discord-Bot.git
cd CBC-Discord-Bot
npm install
cp .env.example .env   # fill in your token and client ID
npm run deploy         # register slash commands
npm start
```

Once the bot is running, use `/setup-add` in your server to point it at your channels and roles.

See the [Wiki — Setup Guide](../../wiki/Setup) for a full walkthrough including required permissions and channel configuration.

---

## Clearing Commands

To remove all registered slash commands (useful when switching guilds or resetting):

```bash
npm run clear-commands
```

---

## License

MIT — you're free to fork this and adapt it for your own community.

**One condition:** credit must be given wherever this bot or a derivative of it is used. A mention in your README or bot description pointing back to this repo and [@AskewCow](https://github.com/AskewCow) is all that's needed.

---

*CBC Discord Bot — Claude Builder Club, Trinity College Dublin*
