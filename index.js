const { Client, Events, GatewayIntentBits, PresenceUpdateStatus } = require('discord.js');
const { Guilds, GuildMessages, MessageContent } = GatewayIntentBits;
const dotenv = require('dotenv');
const linkifyit = require('linkify-it');
const { fetch, request } = require('undici');
const { parseHTML } = require('linkedom');
const puppeteer = require('puppeteer');

dotenv.config();
const DEBUG = "true" === process.env.DEBUG;
const TRACE = "true" === process.env.TRACE;

const ARCHIVE_URL = "https://archive.is/";
const CLIENT = new Client({
	intents: [ Guilds, GuildMessages, MessageContent ]
});
const NO_URL_REPLY = "Get bent, skinbag (there's no URL in this message)";
const PAYWALL_ATTRIBUTES = {
	"data-campaign": {
		contains: [
			"PAYWALL",
			"REGIWALL",
			"REGWALL",
			"OFFER"
		]
	},
	"data-test-id": {
		contains: [
			"REGWALL"
		]
	},
	"allow": {
		contains: [
			"payment"
		]
	},
	"class": {
		contains: [
			"PAYWALL",
			"OFFER",
			"-pay-",
			"metered-content", "meteredContent",
			"subscriber", "subscriber-only", "subscription"
		]
	},
	"href": {
		contains: [
			"subscriptions/checkout",
			"subscription/checkout"
		]
	},
	"id": {
		contains: [
			"PAYWALL",
			"REGWALL",
			"OFFER",
			"barrier-page",
			"barrier",
			"fortress"
		]
	}
};
const PAYWALL_KEYWORDS = [
	'Already a subscriber?', 'subscribe', 'subscription', 'paywall', 'unlock access', 'unlocks access',
	'continue reading', 'Continue with a free trial', "Register"
];
const PROTOCOLS = [ 'https://', 'http://' ];
const { TOKEN } = process.env;

const linkify = linkifyit();
linkify.tlds(require('tlds')).add('ftp:', null);

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

const extractUrls = async (message) => {
	const { content } = message;

	if (!linkify.test(content)) {
		return [];
	}

	const matches = linkify.match(content);
	const cleaned = [];

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

const findPaywall = async (url) => {
	console.log('Launching browser');
	const browser = await puppeteer.launch();
	console.log('Generating new page');
	const page = await browser.newPage();
	console.log("Setting user agent on page");
	await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36");
	console.log(`Going to url ${url}`);
	await page.goto(url, { timeout: 120000, waitUntil: 'networkidle2' });

	console.log('Scanning for paywall attribute');
	if (await hasPaywallAttributePage(page)) {
		return true;
	}

	// Should likely switch to page.evaluate(() => document.body.textContent and go from there
	console.log('Getting page text content');
	const textContent = await page.content();

	console.log('Scanning for paywall keywords');
	return hasPaywallKeyword(textContent);
};

const getDetectedProtocolUrl = async (baseUrl) => {
	for (const protocol of PROTOCOLS) {
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
		if (TRACE) {
			console.log('Response status', statusCode);
			console.log('Response headers', headers);
		}

		if (DEBUG) {
			console.log('Data', data);
		}

		return data;
	} catch(error) {
		console.error(`Couldn't get page content for url ${url}`);
		if (DEBUG) {
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
			paywalled: await findPaywall(url)
		};
		pages[url] = page;
	}

	return pages;
};

const getArchive = async (url) => {
	const NO_RESULT = {
		result: false,
		archive: null
	};
	const searchUrl = `${ARCHIVE_URL}${url}`;
	const response = await fetch(searchUrl);

	const html = await response.text();
	const { document } = parseHTML(html);

	// Container element for links
	const textBlocks = document.queryselectorAll('div.TEXT-BLOCK');

	if (!textBlocks || textBlocks.length === 0) {
		return NO_RESULT;
	}

	const textBlock = textBlocks[0];
	const archives = textBlock.querySelectorAll('a');

	if (!archives || archives.length === 0) {
		return NO_RESULT;
	}

	const latestArchive = archives.find(archive => archive.href);

	if (!latestArchive) {
		return NO_RESULT;
	}

	return {
		result: true,
		archive: latestArchive.href
	};
};

const getArchives = async (urls) => {
	const archives = {};

	for (const url of urls) {
		const archive = await getArchive(url);
		archives[url] = archive;
	}

	return archives;
};

const hasPaywallAttribute = (document) => {
	for (const prop in document) {
		console.log("Document has prop", prop);
	}
	for (const attributeName in PAYWALL_ATTRIBUTES) {
		const attribute = PAYWALL_ATTRIBUTES[attributeName];
		if (!attribute.contains) {
			continue;
		}

		for (const value of attribute.contains) {
			const lower = value.toLowerCase();
			const selector = `[${attributeName}*="${value}"], [${attributeName}*="${lower}"]`;

			if (document.querySelector(selector) !== null) {
				return true;
			}
		}
	}

	return false;
};

const hasPaywallAttributePage = async (page) => {
	for (const attributeName in PAYWALL_ATTRIBUTES) {
		const attribute = PAYWALL_ATTRIBUTES[attributeName];
		if (!attribute.contains) {
			continue;
		}

		for (const value of attribute.contains) {
			const lower = value.toLowerCase();
			const selector = `[${attributeName}*="${value}"], [${attributeName}*="${lower}"]`;

			const element = await page.$(selector);

			if (DEBUG) {
				console.log(await page.content());
			}

			if (element !== null) {
				return true;
			}
		}
	}

	return false;
};

const hasPaywallKeyword = (data) => PAYWALL_KEYWORDS.some(kw => data.includes(kw) || data.toLowerCase().includes(kw.toLowerCase()));

const isBotMessage = (message) => {
	return message.author.id === CLIENT.user.id;
};

const logMessageProperties = (message) => {
	for (const prop in message) {
		console.log(`Message property ${prop}: ${message[prop]}`);
	}
};

const protocolsMatch = (match) => {
	const { raw, url } = match;

	return PROTOCOLS.some(protocol => raw.startsWith(protocol) && url.startsWith(protocol));
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
	const pages = await getPages(urls);
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
