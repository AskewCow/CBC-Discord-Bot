const { AttachmentBuilder } = require('discord.js');
const { ticketNo } = require('./ticket');

const FETCH_PAGE   = 100;
const MAX_MESSAGES = 5000; // safety cap for very long tickets

// Page backwards through the channel history and return every message in
// chronological order (Discord's API returns newest-first).
async function fetchAllMessages(channel) {
  const all = [];
  let before;

  while (all.length < MAX_MESSAGES) {
    const opts = { limit: FETCH_PAGE };
    if (before) opts.before = before;

    const batch = await channel.messages.fetch(opts);
    if (batch.size === 0) break;

    const arr = [...batch.values()];
    all.push(...arr);
    before = arr[arr.length - 1].id;

    if (batch.size < FETCH_PAGE) break;
  }

  return all.reverse();
}

const pad2 = n => String(n).padStart(2, '0');

function fmtTimestamp(date) {
  return (
    `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ` +
    `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())} UTC`
  );
}

function formatMessage(msg) {
  const author = `${msg.author?.tag ?? 'Unknown'}${msg.author?.bot ? ' [BOT]' : ''} (${msg.author?.id ?? '?'})`;
  const lines  = [`[${fmtTimestamp(msg.createdAt)}] ${author}`];

  if (msg.content) {
    for (const line of msg.content.split('\n')) lines.push(`    ${line}`);
  }

  for (const embed of msg.embeds) {
    const parts = [];
    if (embed.title)       parts.push(embed.title);
    if (embed.description)  parts.push(embed.description);
    for (const f of embed.fields ?? []) parts.push(`${f.name}: ${f.value}`);
    if (embed.footer?.text) parts.push(embed.footer.text);
    lines.push(`    [embed] ${parts.join(' | ').replace(/\n/g, ' ')}`);
  }

  for (const att of msg.attachments.values()) {
    lines.push(`    [attachment] ${att.name} — ${att.url}`);
  }

  if (!msg.content && msg.embeds.length === 0 && msg.attachments.size === 0) {
    lines.push('    [no text content]');
  }

  return lines.join('\n');
}

// Build a plain-text .txt transcript of a ticket channel as a Discord attachment.
async function generateTranscript(channel, ticket, closedByUser) {
  const messages = await fetchAllMessages(channel);
  const num      = ticketNo(ticket.id);

  const header = [
    `Transcript - Ticket #${num}`,
    `Channel:    #${channel.name} (${channel.id})`,
    `Category:   ${ticket.topic || 'Other'}`,
    `Opener:     ${ticket.opener_id}`,
    `Opened:     ${ticket.created_at ? fmtTimestamp(new Date(ticket.created_at * 1000)) : 'unknown'}`,
    `Closed:     ${fmtTimestamp(new Date())}`,
    `Closed by:  ${closedByUser ? `${closedByUser.tag} (${closedByUser.id})` : 'unknown'}`,
    `Messages:   ${messages.length}`,
    '='.repeat(60),
    '',
  ].join('\n');

  const body   = messages.map(formatMessage).join('\n\n');
  const buffer = Buffer.from(`${header}${body}\n`, 'utf8');

  return new AttachmentBuilder(buffer, { name: `ticket-${num}-transcript.txt` });
}

module.exports = { generateTranscript };
