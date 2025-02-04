const { Client, Events, GatewayIntentBits, PresenceUpdateStatus } = require('discord.js');
const { Guilds, GuildMessages, MessageContent } = GatewayIntentBits;
const dotenv = require('dotenv');

const { getArchives } = require('./archives');
const { getPages } = require('./pages');
const { findPaywall } = require('./paywalls');
const { extractUrls } = require('./urls');

dotenv.config();
const DEBUG = "true" === process.env.DEBUG;
const TRACE = "true" === process.env.TRACE;

const ARCHIVE_URL = "https://archive.is/";
const CLIENT = new Client({
	intents: [ Guilds, GuildMessages, MessageContent ]
});
const NO_URL_REPLY = "Get bent, skinbag (there's no URL in this message)";
const { TOKEN } = process.env;

const buildReply = (pages, archives) => {
	const urls = Object.keys(pages);
	const total = urls.length;
	const successful = countPages(pages, urls);

	if (total === 1) {
		return buildSingleUrlReply(pages, urls, successful);
	}

	const failed = total - successful;

	return buildMultiUrlReply(pages, urls, successful, failed);
};

const buildSingleUrlReply = (pages, urls, successful) => {
	if (successful === 0) {
		return "I couldn't get the content for that page :(";
	}

	const url = urls[0];
	return `I was able to get the content for the ${url} page!`;
};

const buildMultiUrlReply = (pages, urls, successful, failed) => {
	if (successful > 0 && failed === 0) {
		return `I was able to get the content for all ${successful} pages!`;
	} else if (successful > 0 && failed > 0) {
		return `I was only able to get the content for ${successful} out of ${total} pages (${failed} of ${total} failed)`;
	} else {
		return `I wasn't able to get the content for any of the ${total} pages :(`;
	}
};

const countArchives = (archives, urls) => urls.filter(url => archives[url].result).length;

const countPages = (pages, urls) => urls.filter(url => !pages[url].error).length;

const isBotMessage = (message) => {
	return message.author.id === CLIENT.user.id;
};

const logMessageProperties = (message) => {
	for (const prop in message) {
		console.log(`Message property ${prop}: ${message[prop]}`);
	}
};

CLIENT.once(Events.ClientReady, readyClient => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
	readyClient.user.setStatus(PresenceUpdateStatus.Online);
});

CLIENT.on(Events.MessageCreate, async message => {
	if (TRACE) {
		console.log('Received message create event');
		logMessageProperties(message);
	}

	if (DEBUG) {
		console.log(`Message content: ${message}`);
	}

	if (isBotMessage(message)) {
		return;
	}

	const urls = await extractUrls(message);

	if (urls.length === 0) {
		if (DEBUG) {
			console.log("No URLs found in message content");
		}
		message.reply(NO_URL_REPLY);
		return;
	}

	console.log("Extracted urls", urls);
	const [ pages, archives ] = await processUrls(urls);
	message.reply(buildReply(pages, archives));
});

const processUrls = async (urls) => {
	// We get page contents for urls, to see if they're paywalled
	const pages = await getPages(urls, DEBUG, TRACE);
	const foundPages = Object.values(pages).filter(page => !page.error);
	const paywalledPages = foundPages.filter(page => page.paywalled);
	console.log(`Found ${paywalledPages.length} paywalled pages`);
	// When we've confirmed paywall detection is working, add filter condition
	// A la page => !page.error && page.paywalled
	const archiveResults = await getArchives(paywalledPages.map(page => page.url));
	console.log(`Got archiveResults: ${JSON.stringify(archiveResults)}`);
	const archives = Object.values(archiveResults).filter(archive => archive.result);

	return [ pages, archives ];
};

CLIENT.login(TOKEN);
