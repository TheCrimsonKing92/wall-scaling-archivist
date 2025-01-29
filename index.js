const { Client, Events, GatewayIntentBits, PresenceUpdateStatus } = require('discord.js');
const { Guilds, GuildMessages, MessageContent } = GatewayIntentBits;
const dotenv = require('dotenv');
const linkifyit = require('linkify-it');
const { request } = require('undici');

dotenv.config();
const { DEBUG, TOKEN, TRACE } = process.env;
const debug = "true" === DEBUG || false;
const trace = "true" === TRACE || false;

const client = new Client({
	intents: [ Guilds, GuildMessages, MessageContent ]
});

const linkify = linkifyit();
linkify.tlds(require('tlds')).add('ftp:', null);

const protocols = ['https://', 'http://'];

const buildReply = (pages) => {
	const urls = Object.keys(pages);
	const total = urls.length;

	if (total === 0) {
		return "Get bent, skinbag (there's no URL in this message)";
	}

	if (total === 1) {
		const first = urls[0];
		if (countSuccesses(pages, urls) === 0) {
			return "I couldn't get the content for that page :(";
		}

		return `I was able to get the content for the ${first} page!`;
	}

	const successful = countSuccesses(pages, urls);
	const failed = total - successful;

	if (successful > 0 && failed === 0) {
		return `I was able to get the content for all ${successful} pages!`;
	} else if (successful > 0 && failed > 0) {
		return `I was only able to get the content for ${successful} out of ${total} pages (${failed} of ${total} failed)`;
	} else {
		return `I wasn't able to get the content for any of the ${total} pages :(`;
	}
};

const countSuccesses = (pages, urls) => urls.filter(url => !pages[url].error).length;

const extractUrls = async (message) => {
	const { content } = message;

	if (!linkify.test(content)) {
		return [];
	}

	const matches = linkify.match(content);
	const cleaned = [];

	const protocolsMatch = (match) => {
		const { raw, url } = match;

		return protocols.some(protocol => raw.startsWith(protocol) && url.startsWith(protocol));
	};

	// Would be nice to do this with map, but this was easier to express
	for (const match of matches) {
		if (protocolsMatch(match)) {
			cleaned.push(match.url);
		} else {
			cleaned.push(await getDetectedProtocolUrl(match.raw));
		}
	}

	return cleaned.filter(url => url !== null);
};

const findPaywall = data => {
	// Will likely need different paywall detection methods
	return false;
};

const getDetectedProtocolUrl = async (baseUrl) => {
	for (const protocol of protocols) {
		const url = `${protocol}${baseUrl}`;

		try {
			const { statusCode } = await request(url, { method: 'HEAD' });

			if (statusCode >= 200 && statusCode < 400) {
				return url;
			}
		} catch (err) {
			// Ignored
		}
	}

	return null;
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

const isBotMessage = (message) => {
	return message.author.id === client.user.id;
};

const isPaywalled = async (url) => {
	getPage(url).then(findPaywall)
		    .catch(reason => { console.error(reason); throw reason; });
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

	const urls = await extractUrls(message);
	console.log("Extracted urls", urls);
	const pages = await getPages(urls);
	message.reply(buildReply(pages));
});

client.login(TOKEN);
