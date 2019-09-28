// Imports
const mysql = require('mysql');
const discord = require('discord.js');
const presentationTier = require('./presentation-tier.js');
const settings = require('./settings.json');

// Exports
module.exports.connection = mysql.createConnection({
    host: settings.connection.host,
    database: settings.connection.database,
    user: settings.connection.user,
    password: settings.connection.password,
});

module.exports.client = new discord.Client();

// Connect to database.
module.exports.connection.connect(error => { if (error) throw error; });

// Login to Discord.
module.exports.client.on('guildCreate', guild => presentationTier.onGuildCreate(guild));
module.exports.client.on('message', message => presentationTier.onMessage(message));
module.exports.client.login(settings.token);
