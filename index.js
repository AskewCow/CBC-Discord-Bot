require('dotenv').config();

const { BOT_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!BOT_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Missing required env vars: BOT_TOKEN, CLIENT_ID, GUILD_ID');
  process.exit(1);
}

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
