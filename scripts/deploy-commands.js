require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const { BOT_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!BOT_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Missing BOT_TOKEN, CLIENT_ID, or GUILD_ID in .env');
  process.exit(1);
}

function getJsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...getJsFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.js')) results.push(fullPath);
  }
  return results;
}

const commandsPath = path.join(__dirname, '..', 'src', 'commands');
const commands = [];

for (const file of getJsFiles(commandsPath)) {
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
})();
