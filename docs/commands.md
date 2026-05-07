# CBC Discord Bot — Command & Behaviour Reference

> Updated as features are added. All admin commands require the **Administrator** permission.

---

## Table of Contents

- [Setup](#setup)
- [Onboarding](#onboarding)
- [Tickets](#tickets)
- [Format Message](#format-message)
- [Events](#events)
- [Invites](#invites)

---

## Setup

### `/setup-add`
Adds a configuration value for the server (channels, categories, roles). After every add, a full setup board is shown reflecting the current state.

| Option | Type | Description |
|--------|------|-------------|
| `type` | Choice | The setting to configure (see choices below) |
| `channel` / `category` / `role` | Mention | The value to add (type must match) |

**Configurable settings:**

| Key | Type | Description |
|-----|------|-------------|
| `announcements_channel` | Channel | Where announcements are posted |
| `mod_log_channel` | Channel | Where mod/admin log embeds are sent |
| `onboarding_channel` | Channel | Reserved for onboarding-related use |
| `projects_channel` | Channel | Where project submissions are posted |
| `events_channel` | Channel | Where event posts are sent |
| `general_channel` | Channel | General channel reference |
| `ticket_channel` | Channel | Where ticket panels are posted |
| `ticket_category` | Category | Category that new ticket channels are created under |
| `admin_role` | Role | Full staff access on ticket channels |
| `committee_role` | Role | Full staff access on ticket channels |

Running the command with no value shows the full setup board for the server.
Multiple values are supported per setting (e.g. several mod roles).

### `/setup-remove`
Removes a configuration value. Same options as `/setup-add`. After every removal, the full setup board is shown.

### `/setup-view`
Shows the current server configuration as a setup board. Each setting displays ✅ with its linked values or ❌ if unconfigured. **Admin only.**

---

## Onboarding

Onboarding sends an automatic DM to members when they join. Admins configure either a simple welcome message, a question form, or both together.

### Flow types

| Type | Behaviour |
|------|-----------|
| **Welcome only** | Sends a single welcome embed and marks the member as onboarded |
| **Questions only** | Walks the member through a series of questions via DM |
| **Welcome + Questions** | Sends the welcome message first, then starts the question form |

The welcome message and the question form are configured independently and can coexist. Setting a welcome message never removes existing questions, and adding questions never removes the welcome message.

### On form completion

When a member finishes the question form, the bot:
1. Sends a completion confirmation embed in the DM
2. Posts a **Member Joined** embed to `mod_log_channel` containing all questions and answers

### DM behaviour

- At the start of a form with at least one open-ended question, the bot sends a brief instruction message explaining how to respond
- **Yes/No questions** show two buttons; the member taps one to answer
- **Open-ended questions** wait for the member's next DM message; the full message is recorded as the answer
- If a member leaves and rejoins, any in-progress session is abandoned and a fresh one starts

---

### `/onboarding-flow set-welcome`

Opens a modal to set the welcome message. This is sent as the first DM whenever a member joins, regardless of whether a question form is also configured.

To remove the welcome message without deleting the whole flow, use `/onboarding-flow set-welcome` and leave the field blank is not supported — use `/onboarding-flow delete` to remove everything, then re-add just the questions with `/onboarding-flow add`.

---

### `/onboarding-flow add`

Adds a question to the form. If no question form exists yet, one is created automatically.

| Option | Value | Description |
|--------|-------|-------------|
| `type` | `text` | Open-ended question; member replies by typing a message |
| `type` | `yes_no` | Yes/No question; member answers via buttons |

**Yes/No questions** also accept optional follow-up messages:
- **Follow-up if Yes** — sent automatically after the member taps Yes
- **Follow-up if No** — sent automatically after the member taps No

Steps are added in order. Use `/onboarding-flow list` to see current step numbers.

---

### `/onboarding-flow list`

Shows the current onboarding configuration:
- Welcome message (if set), shown at the top
- All questions in order with their type badge and any configured follow-ups

---

### `/onboarding-flow remove`

Removes a single question by its step number (from `/onboarding-flow list`).

| Option | Type | Description |
|--------|------|-------------|
| `step` | Integer | 1-based step number to remove |

---

### `/onboarding-flow clear`

Removes all questions from the form. The welcome message is not affected.

---

### `/onboarding-flow delete`

Deletes the entire onboarding flow including the welcome message and all questions. New members will no longer receive a DM on join.

---

## Tickets

Tickets create a private channel between a member and staff. Admins set up a panel with categories, and each category can have an automated message flow.

### `/ticket-panel setup`

Opens a modal to create or update the ticket panel in the current channel. Sets the embed title and description shown above the category dropdown.

---

### `/ticket-panel add-option`

Adds a category to the panel dropdown. Members select a category when opening a ticket.

| Field | Description |
|-------|-------------|
| Label | Category name shown in the dropdown |
| Description | Short description shown below the label (optional) |
| Emoji | Emoji shown next to the label (optional) |

An **Other** option is always appended automatically and cannot be manually added.

---

### `/ticket-panel remove-option`

Removes a category from the panel. Autocompletes from existing options.

---

### `/ticket-panel view`

Shows the current panel configuration and all categories.

---

### `/ticket-flow add`

Adds an automated message step to a ticket category. Steps run in order when a ticket is opened for that category.

| Option | Value | Description |
|--------|-------|-------------|
| `option` | Autocomplete | The category to attach the step to |
| `type` | `message` | Sends a plain message in the ticket channel |
| `type` | `yes_no` | Asks a yes/no question; optionally sends a follow-up based on the answer |

Yes/No steps pause the flow until the ticket opener responds. The flow resumes from where it left off after the answer.

---

### `/ticket-flow list`

Lists all flow steps for a category in order, with type badges and follow-up content.

---

### `/ticket-flow remove`

Removes a single step by number from a category's flow.

---

### `/ticket-flow clear`

Removes all flow steps from a category.

---

---

## Format Message

### `/format-message`

Posts a styled message to the current channel. Opens a modal to compose the content after options are selected. **Admin only** — hidden from regular members.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `style` | Choice | Yes | The message type (see styles below) |
| `embed` | Boolean | Yes | Post as a rich embed (`true`) or plain text (`false`) |
| `color` | Choice | No | Embed accent color; ignored for plain text (default: style preset) |
| `ping_everyone` | Boolean | No | Send an `@everyone` ping as a follow-up after the message (default: `false`) |

**Styles:**

| Value | Label | Default embed color |
|-------|-------|---------------------|
| `announcement` | 📢 Announcement | Sky `#6A9BCC` |
| `reminder` | ⏰ Reminder | Terracotta `#D97757` |
| `shoutout` | 🌟 Shoutout | Sand `#CD9D7D` |
| `resource` | 📚 Resource | Sage `#788C5D` |

**Color choices:**

| Name | Hex |
|------|-----|
| Default (style preset) | — |
| Black | `#141413` |
| White | `#FAF9F5` |
| Stone | `#B0AEA5` |
| Mist | `#E8E6DC` |
| Terracotta | `#D97757` |
| Sky | `#6A9BCC` |
| Sage | `#788C5D` |
| Sand | `#CD9D7D` |

**Modal fields:**

| Field | Required | Description |
|-------|----------|-------------|
| Title | Yes | Shown as the embed title or bolded header in plain text |
| Body | Yes | Main message content; supports markdown and newlines |
| Link label | No | Display text for an optional hyperlink |
| Link URL | No | Must start with `http://` or `https://`; validated before posting |

**`@everyone` ping behaviour:**

Discord suppresses `@everyone` mentions inside embeds. When `ping_everyone` is `true`, the bot sends a separate plain `@everyone` message immediately after the main message so the ping fires correctly.

---

---

## Events

Events are created by admins or committee members and posted as embeds to the configured `events_channel`. Anyone in the server can register. The bot handles reminders, attendance tracking, and post-event summaries automatically.

### Setup required

| Config key | Type | Purpose |
|------------|------|---------|
| `events_channel` | Channel | Where event embeds are posted |
| `mod_log_channel` | Channel | Where event creation, attendance, and summaries are logged |

---

### `/event-create`

Creates a new event. **Admin or Committee only.**

**Step 1 — slash command parameters:**

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `type` | Choice | Yes | Event type (see below) |
| `datetime` | String | Yes | Date and time — format: `HH:MM DD-MM-YYYY` (e.g. `14:00 15-06-2026`) |
| `duration` | Integer | Yes | Duration in minutes |
| `ping` | Boolean | Yes | Send a separate `@everyone` message after posting the embed |
| `organizer1` | User | Yes | Primary organiser |
| `organizer2–5` | User | No | Up to four additional organisers |

**Step 2 — form (modal):** After submitting the slash command, a form opens with:

| Field | Required | Description |
|-------|----------|-------------|
| Event Name | Yes | The name of the event |
| Location | Yes | Where it takes place |
| Description | No | Optional description shown on the event embed |

All parameters are validated before the form opens. If the date/time is invalid or in the past, an error is shown immediately.

**Event types and embed colours (Anthropic brand palette):**

| Type | Colour |
|------|--------|
| Workshop | Sky `#6A9BCC` |
| Hackathon | Terracotta `#D97757` |
| Research Salon | Sage `#788C5D` |
| Committee Meeting | Sand `#CD9D7D` |
| Tabling | Mist `#E8E6DC` |

**What happens on creation:**
- Event embed is posted to `events_channel` with a **Register** button
- All organisers are automatically registered as participants
- If `ping` is `true`, `@everyone` is sent as a separate message immediately after
- Event creation is logged to `mod_log_channel`

---

### `/event-delete`

Cancels and permanently deletes an event. **Admin only.**

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `event` | Autocomplete | Yes | The event to delete (shows upcoming events by name) |

**What happens on deletion:**
- The event embed in `events_channel` is edited to show a red **Cancelled** notice and the register button is removed
- Every currently registered participant (not withdrawn) receives a cancellation DM with an apology and the original event details
- The event and all associated data (registrations, reminders, organizers) are permanently deleted
- Deletion is logged to `mod_log_channel` with a participant notification count

Only admins can delete events regardless of whether they are the organiser or creator.

---

### Registration flow

**Registering:**
- Any server member can click the **Register** button on the event embed
- A confirmation DM is sent containing event details and a red **Withdraw Registration** button
- The organiser(s) and the person who ran `/event-create` receive a DM with the registrant's username and updated participant total
- The embed's participant count updates live

**Withdrawing:**
- Click **Withdraw Registration** in the confirmation DM
- The organiser(s) and creator are notified with the updated participant total
- The person can re-register at any time using the original event embed

---

### Automated reminders

The bot checks every 60 seconds and sends DMs to all current participants:

| Trigger | Message |
|---------|---------|
| 24 hours before start | "⏰ Reminder: [Event] is tomorrow!" |
| 1 hour before start | "⏰ Reminder: [Event] is starting in 1 hour!" |

Reminders are tracked in the database and survive bot restarts.

---

### Post-event flow

When an event ends (calculated from `datetime` + `duration`):

1. The **Register** button on the original embed is disabled
2. Every current participant (excluding organisers) receives a DM asking if they attended (Yes / No buttons)
3. **Yes** → participant receives the configured follow-up message (see `/event-followup`)
4. **No** → participant receives a "hope to see you next time" message
5. Each response is logged to `mod_log_channel` with the event name, organiser(s), user, and answer
6. A summary embed is DM'd to all organiser(s) and the event creator, and posted to `mod_log_channel`

**Summary includes:**
- Total unique registrations
- Total withdrawn (current state)
- Final participant count

---

### `/event-followup`

Configures the message sent to attendees who click **Yes** after an event ends. **Admin only.**

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `message` | String | No | The follow-up message text |
| `link_text` | String | No | Hyperlink label (e.g. `Join our newsletter`) |
| `link_url` | String | No | URL for the hyperlink |

Running with no options shows the current configuration. If no custom message has been set, the default is:

> *Thank you for attending! We hope to see you at our next event.*

The `link_text` and `link_url` options must be provided together — a URL without label text (or vice versa) will not display a link.

---

---

---

## Invites

The bot tracks which invite code each member used when joining. Invite counts reflect **currently active invitees** — if someone you invited leaves the server, they are deducted from your count automatically.

### Setup required

| Config key | Type | Purpose |
|------------|------|---------|
| `mod_log_channel` | Channel | Where leaderboard generation events are logged |

### How tracking works

- On startup the bot caches all existing invite codes and syncs their use counts to the database
- When a member joins, the bot detects which invite code was used and records it
- When a member leaves, they are marked as departed and no longer count toward any inviter's total
- On restart, any members who left while the bot was offline are automatically detected and back-filled

> **Note:** Joins that occur while the bot is completely offline cannot be attributed to an inviter — Discord does not expose which invite code a user used historically. Departures during downtime are reconciled on the next startup.

---

### `/invite-leaderboard`

Posts the top 10 inviters as an embed. The embed **auto-updates** whenever a new member joins and **stops updating** when the message is deleted. Multiple leaderboards can be active simultaneously. **Admin only.**

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `scope` | Choice | Yes | The time window to count invites over (see below) |
| `include_committee` | Boolean | Yes | Whether committee members appear in the rankings |

**Scope choices:**

| Value | Behaviour |
|-------|-----------|
| `All Time` | Counts all tracked joins since the bot began tracking, minus anyone who has since left |
| `Live (from now)` | Counts only joins that happen after the leaderboard is sent, minus anyone who has since left |

**Medals:** 🥇 🥈 🥉 are shown for the top three. Remaining positions are numbered.

**Mod log:** Every time the command is run, a summary (requester, scope, committee setting, top 3) is posted to `mod_log_channel`.

---

### `/invites`

Shows how many active invitees a member currently has — i.e. members they invited who are still in the server. Visible to everyone. Response is ephemeral (only visible to the person who ran it).

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `user` | User | No | Check another member's invite count instead of your own |

---

### Ticket channel behaviour

- Created under `ticket_category` if configured
- Named `ticket-XXXX` (zero-padded ticket ID)
- Visible to: ticket opener, admin roles, committee roles
- Hidden from everyone else
- Includes a **Close Ticket** button; closing prompts for confirmation, then deletes the channel and logs the closure to `mod_log_channel`
- A member can only have one open ticket at a time per server
