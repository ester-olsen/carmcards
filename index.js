// Imports
const mysql = require('mysql');
const discord = require('discord.js');
const presentationTier = require('./presentation-tier.js');
const settings = require('./settings.json');

// Exports
module.exports.connection = mysql.createConnection({
    host: settings.connection.host,
    port: settings.connection.port,
    database: settings.connection.database,
    user: settings.connection.user,
    password: settings.connection.password,
});

module.exports.client = new discord.Client();

// Start
start();

async function start() {
    await connectToDatabase();
    await loginToDiscord();
}

function connectToDatabase() {
    return new Promise((resolve, reject) => {
        module.exports.connection.connect(error => {
            if (error) throw error;
            console.log('Connected to database');
            resolve();
        });
    });
}

function loginToDiscord() {
    module.exports.client.on('ready', () => { console.log('Logged in'); });
    module.exports.client.on('guildCreate', guild => presentationTier.onGuildCreate(guild));
    module.exports.client.on('message', message => presentationTier.onMessage(message));
    return module.exports.client.login(settings.token);
}
