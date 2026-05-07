# CBC Discord Bot — Command & Behaviour Reference

> Updated as features are added. All admin commands require the **Administrator** permission.

---

## Table of Contents

- [Setup](#setup)
- [Onboarding](#onboarding)
- [Tickets](#tickets)
- [Format Message](#format-message)

---

## Setup

### `/setup-add`
Adds a configuration value for the server (channels, categories, roles).

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

Running the command with no value shows the current entries for that setting.
Multiple values are supported per setting (e.g. several mod roles).

### `/setup-remove`
Removes a configuration value. Same options as `/setup-add`.

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

### Ticket channel behaviour

- Created under `ticket_category` if configured
- Named `ticket-XXXX` (zero-padded ticket ID)
- Visible to: ticket opener, admin roles, committee roles
- Hidden from everyone else
- Includes a **Close Ticket** button; closing prompts for confirmation, then deletes the channel and logs the closure to `mod_log_channel`
- A member can only have one open ticket at a time per server
