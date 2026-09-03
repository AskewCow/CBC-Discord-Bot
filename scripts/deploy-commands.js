require('dotenv').config();
const { REST, Routes } = require('discord.js');
const path = require('path');
const { walkJs } = require('../src/utils/walkJs');

const { BOT_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!BOT_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Missing BOT_TOKEN, CLIENT_ID, or GUILD_ID in .env');
  process.exit(1);
}

const commandsPath = path.join(__dirname, '..', 'src', 'commands');
const commands = [];

for (const file of walkJs(commandsPath)) {
  const command = require(file);
  if (command.data) {
    commands.push(command.data.toJSON());
  }
}

const rest = new REST().setToken(BOT_TOKEN);

(async () => {
  console.log(`Deploying ${commands.length} command(s) to guild ${GUILD_ID}...`);
  const data = await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
  console.log(`Successfully deployed ${data.length} command(s).`);
})().catch((err) => {
  console.error('Command deployment failed:', err);
  process.exit(1);
});
