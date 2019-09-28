// Imports
const index = require('./index.js');
const settings = require('./settings.json');

// Exports
module.exports = {
    getCards,
    getCardSets,
    addCollector,
    getCollectors,
    setCollector,
    addPossession,
    getPossessions,
    removePossession,
    getCardByNumber,
    getCollectorByDiscordId,
    getCardsOwned,
    getFoilCardsOwned,
    getRandomCard,
    getCardSetById,
    collectorCanDraw,
    getTimeUntilDraw,
    getPaginatedCardInformation,
    collectorHasCards,
    getPages
};

// Constructor functions
function Card(id, number, isFoil, imageUrl, cardSetId) {
    this.id = id,
    this.number = number;
    this.isFoil = isFoil;
    this.imageUrl = imageUrl;
    this.cardSetId = cardSetId;
}

function CardSet(id, name) {
    this.id = id;
    this.name = name;
}

function Collector(id, discordId, lastDraw) {
    this.id = id,
    this.discordId = discordId;
    this.lastDraw = lastDraw;
}

function Possession(id, collectorId, cardId) {
    this.id = id;
    this.collectorId = collectorId;
    this.cardId = cardId;
}

// CRUD functions
function getCards() {
    return new Promise((resolve, reject) => {
        index.connection.query('SELECT * FROM card', (error, results) => {
            if (error) reject(error);
            let cards = results.map(result => new Card(result.id, result.number, result.is_foil, result.image_url, result.card_set_id));
            resolve(cards);
        });
    });
}

function getCardSets() {
    return new Promise((resolve, reject) => {
        index.connection.query('SELECT * FROM card_set', (error, results) => {
            if (error) reject(error);
            let cardSets = results.map(result => new CardSet(result.id, result.name));
            resolve(cardSets);
        });
    });
}

function addCollector(discordId) {
    return new Promise((resolve, reject) => {
        index.connection.query(`INSERT INTO collector (discord_id) VALUES (${discordId})`, (error) => {
            if (error) reject(error);
            resolve();
        });
    });
}

function getCollectors() {
    return new Promise((resolve, reject) => {
        index.connection.query('SELECT * FROM collector', (error, results) => {
            if (error) reject(error);
            let collectors = results.map(result => new Collector(result.id, result.discord_id, result.last_draw));
            resolve(collectors);
        });
    });
}

function setCollector(collector) {
    return new Promise((resolve, reject) => {
        index.connection.query(`UPDATE collector SET discord_id = "${collector.discordId}", last_draw = "${collector.lastDraw}" WHERE id = ${collector.id}`, (error) => {
            if (error) reject(error);
            resolve();
        });
    });
}

function addPossession(collectorId, cardId) {
    return new Promise((resolve, reject) => {
        index.connection.query(`INSERT INTO possession (collector_id, card_id) VALUES (${collectorId}, ${cardId})`, (error) => {
            if (error) reject(error);
            resolve();
        });
    });
}

function getPossessions() {
    return new Promise((resolve, reject) => {
        index.connection.query('SELECT * FROM possession', (error, results) => {
            if (error) reject(error);
            let possessions = results.map(result => new Possession(result.id, result.collector_id, result.card_id));
            resolve(possessions);
        });
    });
}

function removePossession(collectorId, cardId) {
    return new Promise((resolve, reject) => {
        index.connection.query(`DELETE FROM possession WHERE collector_id = ${collectorId} AND card_id = ${cardId} LIMIT 1`, (error) => {
            if (error) reject(error);
            resolve();
        });
    });
}

// Getter functions
async function getCardByNumber(number, isFoil) {
    let cards = await getCards();
    return cards.find(card => card.number == number && card.isFoil == isFoil);
}

async function getCollectorByDiscordId(discordId) {
    let collectors = await getCollectors();
    return collectors.find(collector => collector.discordId == discordId);
}

async function getCardsOwned(collectorId, cardNumber) {
    // Get the IDs of all cards with this number.
    let cards = await getCards();
    cards = cards.filter(card => card.number == cardNumber);
    let cardIds = cards.map(card => card.id);

    // Get all possessions with this collector ID.
    let possessions = await getPossessions();
    possessions = possessions.filter(possession => possession.collectorId == collectorId);

    // Filter all the possessions that have one of the card IDs.
    possessions = possessions.filter(possession => cardIds.includes(possession.cardId));

    // Return the number of possessions.
    return possessions.length;
}

async function getFoilCardsOwned(collectorId, cardNumber) {
    // Get the ID of the foil card with this number.
    let cards = await getCards();
    let card = cards.find(card => card.number == cardNumber && card.isFoil);
    if (!card) return 0;
    let cardId = card.id;

    // Get all possessions with this collector ID.
    let possessions = await getPossessions();
    possessions = possessions.filter(possession => possession.collectorId == collectorId);

    // Filter all the possessions that have the card ID.
    possessions = possessions.filter(possession => possession.cardId == cardId);

    // Return the number of possessions.
    return possessions.length;
}

async function getRandomCard() {
    // Determine if it'll be a foil card.
    let isFoil = Math.random() < settings.foilChance;

    // Get cards that are either foil or not foil.
    let cards = await getCards();
    cards = cards.filter(card => card.isFoil == isFoil);

    // Get a random card.
    let index = Math.floor(Math.random() * cards.length);
    let card = cards[index];

    // Return the card.
    return card;
}

async function getCardSetById(id) {
    let cardSets = await getCardSets();
    return cardSets.find(cardSet => cardSet.id == id);
}

function collectorCanDraw(collector) {
    if (collector.lastDraw) {
        // Check if the difference between now and their last draw is less than one day, all calculated as milliseconds.        
        const oneDay = 86400000;
        let timeSinceDraw = new Date() - collector.lastDraw;
        return timeSinceDraw >= oneDay;
    }

    return true;
}

function getTimeUntilDraw(collector) {
    // Calculate time since their last draw.
    let timeSinceDraw = new Date() - collector.lastDraw;

    // Calculate time until their next draw in milliseconds.
    const oneDay = 86400000;
    let remainingTime = oneDay - timeSinceDraw;

    // Convert remaining time from milliseconds to hours and minutes.
    let hours = Math.floor((remainingTime / (1000 * 60 * 60)) % 24);
    let minutes = Math.floor((remainingTime / (1000 * 60)) % 60);

    // Return an object with the time.
    return {
        hours: hours,
        minutes: minutes
    };
}

async function getPaginatedCardInformation(collectorId, page) {
    // Get possessions with the collector's ID.
    let possessions = await getPossessions();

    // Get the cards referenced in the possessions.
    let cards = await getCards();
    cards = possessions.map(possession => cards.find(card => card.id == possession.cardId));

    // Determine number of pages.
    let uniqueCards = cards.filter(card => {
        let firstOccurrence = cards.find(x => x.number == card.number);
        return card == firstOccurrence;
    });

    const cardsPerPage = settings.cardsPerPage;
    let pages = Math.ceil(uniqueCards.length / cardsPerPage);

    // Get a subset of the cards determined by pagination.
    uniqueCards = uniqueCards.slice(page * cardsPerPage, (page + 1) * cardsPerPage);

    // Attach card sets to each card.
    let cardSets = await getCardSets();
    uniqueCards = uniqueCards.map(uniqueCard => attachCardSet(cardSets, uniqueCard));

    // For each card number, create an object with information about the collection.
    let cardInformationArray = await uniqueCards.map(uniqueCard => {
        return {
            number: uniqueCard.number,
            cardSet: uniqueCard.cardSet,
            quantity: getQuantity(cards, uniqueCard.number),
            hasFoil: hasFoil(cards, uniqueCard.number)
        };
    });

    // Sort card information objects by number.
    cardInformationArray = cardInformationArray.sort((a, b) => a.number - b.number);

    // Return information objects.
    return cardInformationArray;

    function attachCardSet(cardSets, card) {
        let cardSet = cardSets.find(cardSet => cardSet.id == card.cardSetId);
        card.cardSet = cardSet;
        return card;
    }

    function getQuantity(cards, number) {
        let filteredCards = cards.filter(card => card.number == number);
        if (!filteredCards) return 0;
        return filteredCards.length;
    }

    function hasFoil(cards, number) {
        let filteredCards = cards.filter(card => cards.number == number && card.isFoil);
        return filteredCards && filteredCards.length;
    }
}

async function collectorHasCards(collectorId) {
    let possessions = await getPossessions();
    possessions = possessions.filter(possession => possession.collectorId == collectorId);
    return possessions && possessions.length;
}

async function getPages(collectorId) {
    // Get possessions with the collector's ID.
    let possessions = await getPossessions();

    // Get the cards referenced in the possessions.
    let cards = await getCards();
    cards = possessions.map(possession => cards.find(card => card.id == possession.cardId));

    // Determine number of pages.
    let uniqueCards = cards.filter(card => {
        let firstOccurrence = cards.find(x => x.number == card.number);
        return card == firstOccurrence;
    });

    let pages = Math.ceil(uniqueCards.length / settings.cardsPerPage);

    // Return number of pages.
    return pages;
}
