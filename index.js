const { Client, Events, GatewayIntentBits, PresenceUpdateStatus } = require('discord.js');
const { Guilds, GuildMessages, MessageContent } = GatewayIntentBits;
const dotenv = require('dotenv');

dotenv.config();

const { DEBUG, TOKEN, TRACE } = process.env;
const debug = "true" === DEBUG || false;
const trace = "true" === TRACE || false;

// Can be modified later, but usually .org and .gov don't have paywalls
const TLDS = [ ".com", ".net"];

const client = new Client({
	intents: [ Guilds, GuildMessages, MessageContent]
});

// Later this dumb string stuff should become regex
const beginsWithUrlParts = (word) => {
	return word.startsWith("http://") ||
	       word.startsWith("https://") ||
	       word.startsWith("www.");
};

const includesTLD = (word) => {
	const includesAny = (word, inclusions) => {
		return inclusions.some(inclusion => word.includes(inclusion));
	};

	return includesAny(word, TLDS);
};

const includesUrl = (message) => {
	const { content } = message;
	return content.split(" ").some(word => isPlainUrl(word) || isMarkdownUrl(word));
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

const isPlainUrl = (word) => {
	if (trace) {
		console.log(`Is ${word} a plain URL?`);
		console.log(`beginsWithUrlParts? ${beginsWithUrlParts(word)}`);
		console.log(`includesTLD? ${includesTLD(word)}`);
	}

	return  beginsWithUrlParts(word) && includesTLD(word);
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

client.on(Events.MessageCreate, message => {
	console.log('Received message create event');

	if (debug) {
		logMessageProperties(message);
	}

	console.log(`Message content: ${message}`);

	if (!isBotMessage(message)) {
		if (includesUrl(message)) {
			message.reply("This seems to include a URL. Time to work!");
		} else {
			message.reply("I won't do anything without a URL included");
		}
	}
});

client.login(TOKEN);
