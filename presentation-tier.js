// Imports
const discord = require('discord.js');
const index = require('./index.js');
const applicationTier = require('./application-tier.js');

// Exports
module.exports = {
    onGuildCreate,
    onMessage
};

// Event handlers
function onGuildCreate(guild) {
    // Check guild availability.
    if (!guild.available) return;

    // Get a channel the bot is permitted to send messages in.
    let channel = getChannel();
    if (!channel) return;

    // Send a greeting.
    channel.send('Hi! :sunflower: I\'m Carmcards, a Carmilla bot by Ester Olsen.');
    channel.send(`<@${index.client.user.id}> help`);

    function getChannel() {
        let channels = guild.channels.array();
        let textChannels = channels.filter(channel => channel.type === 'text');
        return textChannels.find(channel => channel.memberPermissions(guild.me).has('SEND_MESSAGES'));
    }
}

function onMessage(message) {
    // Check if the user mentioned this bot.
    if (!message.content.startsWith(`<@${index.client.user.id}>`)) return;

    // Remove the mention from the message.
    let content = message.content.substring(`<@${index.client.user.id}>`.length);
    content = content.trim();

    // Match the message to a command.
    if (content.match(/^[Cc]ards?\s*#?\d+[\.\!]*$/)) card(message);
    else if (content.match(/^[Dd]raw[\.\!]*$/)) draw(message);
    else if (content.match(/^[Cc]ollections?\s*#?\d*[\.\!]*$/)) collection(message);
    else if (content.match(/^[Hh]elp[\.\!\?]*$/)) help(message);
    else if (content.match(/^\s*$/)) help(message);
}

// Command functions
async function card(message) {
    // Validate the message.
    if (!isValidMessage(message)) return;

    // Remove the mention from the message.
    let content = message.content.substring(`<@${index.client.user.id}>`.length);

    // Declare variables.
    let collector = await applicationTier.getCollectorByDiscordId(message.author.id);
    let number = content.match(/\d+/);
    let cardsOwned = await applicationTier.getCardsOwned(collector.id, number);

    // Validate the state.
    {
        // Check if the user is a collector.
        if (!collector) {
            message.reply('you haven\'t started your collection yet.');
            return;
        }

        // Check if the user has this card.
        if (!cardsOwned) {
            message.reply('you don\'t have a card with that number.');
            return;
        }
    }

    // Respond with a message about the card.
    {
        // Declare variables.
        let foilCardsOwned = await applicationTier.getFoilCardsOwned(collector.id, number);
        let isFoil = foilCardsOwned ? 1 : 0;
        let card = await applicationTier.getCardByNumber(number, isFoil);
        let cardSet = await applicationTier.getCardSetById(card.cardSetId);

        // Formulate a title.
        let title = `Card #${number}`;
        if (cardSet) title += ` (${cardSet.name})`;

        // Formulate a description.
        let description = `<@${message.author.id}>, you have ${cardsOwned}.`;
        if (foilCardsOwned) description += ` Foil versions, ${foilCardsOwned}.`;

        // Create an embed.
        let richEmbed = new discord.RichEmbed();
        richEmbed.setTitle(title);
        richEmbed.setDescription(description);
        richEmbed.setImage(card.imageUrl);

        // Send the message.
        message.channel.send(richEmbed);
    }
}

async function draw(message) {
    // Validate the message.
    if (!isValidMessage(message)) return;

    // Get collector.
    let collector = await applicationTier.getCollectorByDiscordId(message.author.id);

    // Save the user as a collector.
    if (!collector) {
        await applicationTier.addCollector(message.author.id);
        collector = await applicationTier.getCollectorByDiscordId(message.author.id);
    }

    // Check if the collector can draw yet.
    if (!applicationTier.collectorCanDraw(collector)) {
        // Tell time until next draw.
        {
            // Get remaining time.
            let remainingTime = applicationTier.getTimeUntilDraw(collector);

            // Formulate remaining time as a string.
            let hours = `${remainingTime.hours} ${remainingTime.hours > 1 ? 'hours' : 'hour'}`;
            let minutes = `${remainingTime.minutes} ${remainingTime.minutes > 1 ? 'minutes' : 'minute'}`;
            let content = hours;
            if (!remainingTime.hours) content = minutes;
            else if (remainingTime.hours == 1) content = `${hours} and ${minutes}`;

            // Send message.
            message.reply(`${content} until your next draw.`);
        }

        // Cancel the draw command.
        return;
    }

    // Add a new card to their collection.
    let card = await applicationTier.getRandomCard();
    await applicationTier.addPossession(collector.id, card.id);

    // Update the collector's last draw date.
    collector.lastDraw = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await applicationTier.setCollector(collector);

    // Respond with a message about the draw.
    {
        // Formulate a title.
        let title = `Card #${card.number}`;
        let cardSet = await applicationTier.getCardSetById(card.cardSetId);
        if (cardSet) title += ` (${cardSet.name})`;

        // Formulate a description.
        let description = `<@${message.author.id}>, you collected card #${card.number}!`;
        if (card.isFoil) description += ' It\'s a foil version!';
        
        // Create an embed.
        let richEmbed = new discord.RichEmbed();
        richEmbed.setTitle(title);
        richEmbed.setDescription(description);
        richEmbed.setImage(card.imageUrl);

        // Send message.
        message.channel.send(richEmbed);
    }
}

async function collection(message) {
    // Validate the message.
    if (!isValidMessage(message)) return;

    // Remove the mention from the message.
    let content = message.content.substring(`<@${index.client.user.id}>`.length);

    // Declare variables.
    let collector = await applicationTier.getCollectorByDiscordId(message.author.id);
    let page = content.match(/\d+/);
    let pages = await applicationTier.getPages(collector.id);

    // Validate the state.
    {
        // Check if the user is a collector.
        if (!collector) {
            message.reply('you haven\'t started your collection yet.');
            return;
        }

        // Check if the user has any cards.
        let collectorHasCards = await applicationTier.collectorHasCards(collector.id);

        if (!collectorHasCards) {
            message.reply('you don\'t have any cards in your collection.');
            return;
        }
    }

    // Validate and normalize the page parameter.
    if (page < 1) page = 1;
    else if (page > pages) page = pages;
    page--;

    // Get paginated card information.
    let cardInformationArray = await applicationTier.getPaginatedCardInformation(collector.id, page);

    // Send a message about the given page.
    {
        // Formulate a title.
        let title = message.member.nickname ? `${message.member.nickname}\'s collection` : `${message.author.username}\'s collection`;

        // Formulate a description.
        let description = `<@${message.author.id}>, this is a page from your collection.`;
        if (cardInformationArray) description += '\n\n';
        let cardDescriptions = cardInformationArray.map(cardInformation => `${getCardDescription(cardInformation)}\n`);
        description += cardDescriptions.join('');

        // Formulate a footer.
        let footer = `Page ${page + 1}/${pages}`;

        // Create an embed.
        let richEmbed = new discord.RichEmbed();
        richEmbed.setTitle(title);
        richEmbed.setDescription(description);
        richEmbed.setFooter(footer);

        // Send message.
        message.channel.send(richEmbed);
    }

    function getCardDescription(cardInformation) {
        // Put together the card's title.
        let title = `Card #${cardInformation.number}`;
        if (cardInformation.cardSet) title += ` (${cardInformation.cardSet})`;

        // Pick an emoji to show whether there's a foil version.
        let icon = cardInformation.hasFoil ? ':sparkles:' : ':flower_playing_cards:';

        // Return a description.
        return `${title} ${icon} x${cardInformation.quantity}`;
    }
}

function help(message) {
    // Validate the message.
    if (!isValidMessage(message)) return;

    // Formulate a title.
    let title = 'Carmcard commands';

    // Formulate a description.
    let description = `<@${message.author.id}>, these are the commands. Don't forget to begin with a mention.\n\n`;
    description += `<@${index.client.user.id}> draw — Collect a card. You can use this once a day.\n\n`;
    description += `<@${index.client.user.id}> collection 1 — View a page of cards in your collection.\n\n`;
    description += `<@${index.client.user.id}> card 1 — View a card with a given number.`;

    // Create an embed.
    let richEmbed = new discord.RichEmbed();
    richEmbed.setTitle(title);
    richEmbed.setDescription(description);

    // Send message.
    message.channel.send(richEmbed);
}

// Functions
function isValidMessage(message) {
    // Check if the user is a bot, or if it's a message from this bot to itself.
    if (message.author.bot) {
        if (message.author.id != index.client.user.id) {
            return false;
        }
    }

    // Check if the user mentioned this bot.
    if (!message.content.startsWith(`<@${index.client.user.id}>`)) return false;

    // Return true.
    return true;
}
