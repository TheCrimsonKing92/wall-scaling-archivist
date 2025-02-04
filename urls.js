const linkifyit = require('linkify-it');
const linkify = linkifyit();
linkify.tlds(require('tlds')).add('ftp:', null);

const { request } = require('undici');

const PROTOCOLS = [ 'https://', 'http://' ];

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

const protocolsMatch = (match) => {
        const { raw, url } = match;

        return PROTOCOLS.some(protocol => raw.startsWith(protocol) && url.startsWith(protocol));
};


export const extractUrls = async (message, getDetectedProtoclUrl, protocolsMatch) => {
	const { content } = message;

	if (!linkify.test(content)) {
		return [];
	}

	const matches = linkify.match(content);
	const cleaned = [];

	for (const match of matches) {
		if (protocolsMatch(match)) {
			cleaned.push(match.url);
		} else {
			cleaned.push(await getDetectedProtocolUrl(match.raw));
		}
	}

	return cleaned.filter(url => url !== null);
};

