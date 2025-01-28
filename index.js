const { Client, Events, GatewayIntentBits, PresenceUpdateStatus } = require('discord.js');
const { Guilds, GuildMessages, MessageContent } = GatewayIntentBits;
const dotenv = require('dotenv');
const { request } = require('undici');

dotenv.config();

const { DEBUG, TOKEN, TRACE } = process.env;
const debug = "true" === DEBUG || false;
const trace = "true" === TRACE || false;

// Can be modified later, but usually .org and .gov don't have paywalls
const TLDS = [ ".com", ".gov", ".net" ];

const client = new Client({
	intents: [ Guilds, GuildMessages, MessageContent ]
});

// Later this dumb string stuff should become regex
const beginsWithUrlParts = (word) => {
	return word.startsWith("http://") ||
	       word.startsWith("https://") ||
	       word.startsWith("www.");
};

const buildReply = (pages) => {
	const urls = Object.keys(pages);

	if (urls.length === 0) {
		return "Get bent, skinbag (there's no URL in this message)";
	}

	if (urls.length === 1) {
		const theUrl = urls[0];
		if (pages[theUrl].error) {
			return "I couldn't get the content for that page :(";
		}

		return `I was able to get the content for the ${theUrl} page!`;
	}

	const successful = urls.filter(url => !pages[url].error).length;
	const failed = urls.filter(url => pages[url].error).length;
	const total = urls.length;

	if (successful > 0 && failed === 0) {
		return `I was able to get the content for all ${successful} pages!`;
	} else if (successful > 0 && failed > 0) {
		return `I was only able to get the content for ${successful} out of ${total} pages (${failed} of ${total} failed)`;
	} else {
		return `I wasn't able to get the content for any of the ${total} pages :(`;
	}
};

const extractUrls = (message) => {
	const { content } = message;
	if (!includesUrl(content)) {
		return [];
	}

	return content.split(" ").filter(isUrl);
};

const findPaywall = data => {
	// Will likely need different paywall detection methods
	return false;
};

const getPage = async (url) => {
	try {
		const { statusCode, headers, body } = await request(url);
		const data = await body.text();
		if (trace) {
			console.log('Response status', statusCode);
			console.log('Response headers', headers);
		}

		if (debug) {
			console.log('Data', data);
		}

		return data;
	} catch(error) {
		console.error(`Couldn't get page content for url ${url}`);
		if (debug) {
			console.error(error);
		}
		return null;
	}
};

const getPages = async (urls) => {
	const pages = {};
	for (const url of urls) {
		const data = await getPage(url);
		const page = {
			error: data === null,
			url,
			page: data,
			paywalled: findPaywall(data)
		};
		pages[url] = page;
	}

	return pages;
};

const includesTLD = (word) => {
	const includesAny = (word, inclusions) => {
		return inclusions.some(inclusion => word.includes(inclusion));
	};

	return includesAny(word, TLDS);
};

const includesUrl = (content) => {
	return content.split(" ").some(isUrl);
};

const isBotMessage = (message) => {
	return message.author.id === client.user.id;
};

const isMarkdownUrl = (word) => {
	if (trace) {
		console.log(`Is ${word} a Markdown URL?`);
		console.log(`Starts with left bracket? ${word.startsWith("[")}`);
		console.log(`Ends with right paren? ${word.endsWith(")")}`);
		console.log(`Includes TLD? ${includesTLD(word)}`);
	}
	return word.startsWith("[") && word.endsWith(")") && includesTLD(word);
};

const isPaywalled = async (url) => {
	getPage(url).then(findPaywall)
		    .catch(reason => { console.error(reason); throw reason; });
};

const isPlainUrl = (word) => {
	if (trace) {
		console.log(`Is ${word} a plain URL?`);
		console.log(`beginsWithUrlParts? ${beginsWithUrlParts(word)}`);
		console.log(`includesTLD? ${includesTLD(word)}`);
	}

	return  beginsWithUrlParts(word) && includesTLD(word);
};

const isUrl = (word) => {
	if (debug) {
		console.log(`Is ${word} a URL?`);
		console.log(`isPlainUrl? ${isPlainUrl(word)}`);
		console.log(`isMarkdownUrl? ${isMarkdownUrl(word)}`);
	}

	return isPlainUrl(word) || isMarkdownUrl(word);
};

const logMessageProperties = (message) => {
	for (const prop in message) {
		console.log(`Message property ${prop}: ${message[prop]}`);
	}
};

client.once(Events.ClientReady, readyClient => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
	readyClient.user.setStatus(PresenceUpdateStatus.Online);
});

client.on(Events.MessageCreate, async message => {
	if (trace) {
		console.log('Received message create event');
		logMessageProperties(message);
	}

	if (debug) {
		console.log(`Message content: ${message}`);
	}

	if (isBotMessage(message)) {
		return;
	}

	const urls = extractUrls(message);
	const pages = await getPages(urls);
	message.reply(buildReply(pages));
});

client.login(TOKEN);
