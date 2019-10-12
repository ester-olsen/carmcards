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
    else if (content.match(/^[Tt]rade\s*<@\d+>\s*\d+\s*(foil)?$/)) trade(message);
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

async function trade(message) {
    // Validate the message.
    if (!isValidMessage(message)) return;

    // Remove the mention from the message.
    let content = message.content.substring(`<@${index.client.user.id}>`.length);

    // Get collector.
    let collector = await applicationTier.getCollectorByDiscordId(message.author.id);

    // Get mentioned collector.
    let otherCollector;

    {
        let discordId = content.match(/<@\d+>/);
        
        if (discordId) {
            discordId = discordId[0].match(/\d+/);
            otherCollector = await applicationTier.getCollectorByDiscordId(discordId);
        }
    }

    // Get card.
    let card;

    {
        let cardNumber = content.match(/>\s*\d+/);
        if (cardNumber) cardNumber = cardNumber[0].match(/\d+/);
        
        let isFoil = content.match(/foil/) != null;

        card = await applicationTier.getCardByNumber(cardNumber, isFoil);
    }

    // Validate state.
    {
        // Check if the user is a collector.
        if (!collector) {
            message.reply('you haven\'t started your collection yet.');
            return;
        }

        // Check if the mentioned user is a collector.
        if (!otherCollector) {
            message.reply('the user you mentioned hasn\'t started their collection yet.');
            return;
        }
    }

    // Determine action
    {
        let trade = applicationTier.getTrade(collector, otherCollector);
        if (!trade) trade = applicationTier.getTrade(otherCollector, collector);

        if (!trade) {
            if (card) inviteToTrade(message);
        }
        else {
            if (card && !trade.responder.cardId) acceptInvitationToTrade(message);
            else if (trade.responder.cardId) executeTrade(message);
        }
    }
}

async function inviteToTrade(message) {
    // Remove the mention from the message.
    let content = message.content.substring(`<@${index.client.user.id}>`.length);

    // Declare variables.
    let caller = await applicationTier.getCollectorByDiscordId(message.author.id);
    let cardNumber = content.match(/>\s*\d+/);
    if (cardNumber) cardNumber = cardNumber[0].match(/\d+/);
    let isFoil = content.match(/foil/);
    isFoil = isFoil != null;
    let card = await applicationTier.getCardByNumber(cardNumber, isFoil);

    // Validate the state.
    {
        // Check if the user has this card.
        let cardsOwned = await applicationTier.getCardsOwned(caller.id, cardNumber);

        if (!cardsOwned) {
            message.reply('you don\'t have a card with that number.');
            return;
        }

        // Check if the user has this foil card.
        let foilCardsOwned = await applicationTier.getFoilCardsOwned(caller.id, cardNumber);

        if (isFoil && !foilCardsOwned) {
            message.reply('you don\'t have a foil card with that number.');
            return;
        }
    }

    // Get the other user mentioned in the message
    let responder;

    {
        let discordId = content.match(/<@\d+>/);
        if (discordId) discordId = discordId[0].match(/\d+/);
        responder = await applicationTier.getCollectorByDiscordId(discordId);
    }

    // Check if the user is a collector.
    if (!responder) {
        message.reply('the user you mentioned hasn\'t started a collection yet.');
        return;
    }

    // Add trade
    applicationTier.addTrade(caller, card.id, responder);

    // Send a reply.
    {
        let reply = `you have invited <@${responder.discordId}> to trade for your ${isFoil ? 'foil ' : ''}card #${cardNumber}. To accept, they can use the same command mentioning you and the number of a card they want to trade for it.`;
        message.reply(reply);
    }
}

async function acceptInvitationToTrade(message) {
    // Remove the mention from the message.
    let content = message.content.substring(`<@${index.client.user.id}>`.length);

    // Declare variables.
    let responder = await applicationTier.getCollectorByDiscordId(message.author.id);
    let cardNumber = content.match(/>\s*\d+/);
    if (cardNumber) cardNumber = cardNumber[0].match(/\d+/); 
    let isFoil = content.match(/foil/).length > 0;

    // Validate the state.
    {
        // Check if the user has this card.
        let cardsOwned = await applicationTier.getCardsOwned(responder.id, cardNumber);

        if (!cardsOwned) {
            message.reply('you don\'t have a card with that number.');
            return;
        }

        // Check if the user has this foil card.
        let foilCardsOwned = await applicationTier.getFoilCardsOwned(responder.id, cardNumber);

        if (isFoil && !foilCardsOwned) {
            message.reply('you don\'t have a foil card with that number.');
            return;
        }
    }

    // Get user who sent the invitation.
    let caller;

    {
        let discordId = content.match(/<@\d+>/);
        if (discordId) discordId = discordId[0].match(/\d+/);
        caller = await applicationTier.getCollectorByDiscordId(discordId);
    }

    // Update the trade.
    {
        let trade = applicationTier.getTrade(caller, responder);
        let card = await applicationTier.getCardByNumber(cardNumber, isFoil);
        trade.responder.cardId = card.id;
        applicationTier.setTrade(trade);
    }

    // Send a message
    {
        // Formulate a title.
        let title = 'Accepted trade invitation'

        // Formulate a description.
        let description = `<@${responder.discordId}>, you have offered to trade your ${isFoil ? 'foil ' : ''}card #${cardNumber} for <@${responder.discordId}>'s foil card #1. To execute this trade, they can use the trade command mentioning you.`;

        // Create an embed.
        let richEmbed = new discord.RichEmbed();
        richEmbed.setTitle(title);
        richEmbed.setDescription(description);

        // Send message.
        message.channel.send(richEmbed);
    }
}

async function executeTrade(message) {
    // Get caller.
    let caller = await applicationTier.getCollectorByDiscordId(message.author.id);

    // Get responder.
    let responder;

    {
        let discordId = content.match(/<@\d+>/);
        if (discordId) discordId = discordId[0].match(/\d+/);
        responder = await applicationTier.getCollectorByDiscordId(discordId);
        if (!responder) return;
    }

    // Execute trade.
    let trade = applicationTier.getTrade(caller, responder);
    if (!trade) return;
    await applicationTier.executeTrade(trade);

    // Send a message
    {
        // Formulate a title.
        let title = 'Executed trade'

        // Formulate a description.
        let callerCard = await applicationTier.getCardById(trade.caller.cardId);
        let responderCard = await applicationTier.getCardById(trade.responder.cardId);
        let description = `<@${caller.discordId}>, you have traded your ${callerCard.isFoil ? 'foil ' : ''}card #${callerCard.number} for Zett's ${responderCard.isFoil ? 'foil ' : ''}card #${responderCard.number}.`;

        // Create an embed.
        let richEmbed = new discord.RichEmbed();
        richEmbed.setTitle(title);
        richEmbed.setDescription(description);

        // Send message.
        message.channel.send(richEmbed);
    }
}

// Functions
function isValidMessage(message) {
    // Check if the user is a bot, or if it's a message from this bot to itself.
    if (message.author.bot) {
        if (message.author.id != index.client.user.id) return false;
    }

    // Check if the user mentioned this bot.
    if (!message.content.startsWith(`<@${index.client.user.id}>`)) return false;

    // Return true.
    return true;
}
