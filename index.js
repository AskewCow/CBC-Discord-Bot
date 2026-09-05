require('dotenv').config();

// DATABASE_URL is required too: members, projects, events and announcements all
// live in Postgres, so the bot is not meaningfully functional without it.
const REQUIRED_ENV = ['BOT_TOKEN', 'CLIENT_ID', 'GUILD_ID', 'DATABASE_URL'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}
const { BOT_TOKEN } = process.env;

const {
  Client,
  GatewayIntentBits,
  Partials,
} = require('discord.js');

const logger = require('./src/utils/logger');
const { runSchema } = require('./src/database/schema');
const { loadEvents } = require('./src/handlers/eventHandler');
const { loadCommands } = require('./src/handlers/commandHandler');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

// Initialise database (require triggers singleton connection + WAL mode)
require('./src/database/db');
runSchema();

loadEvents(client);
loadCommands(client);

client.login(BOT_TOKEN).catch((err) => {
  logger.error(`Failed to login: ${err.message}`);
  process.exit(1);
});
