const { parseHTML } = require('linkedom');
const { fetch } = require('undici');

const ARCHIVE_URL = "https://archive.is/";
const NO_RESULT = {
	result: false,
	archive: null
};

export const getArchive = async (url) => {
        const searchUrl = `${ARCHIVE_URL}${url}`;
        const response = await fetch(searchUrl);

        const html = await response.text();
        const { document } = parseHTML(html);

        // Container element for links
        const textBlocks = document.querySelectorAll('div.TEXT-BLOCK');

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

export const getArchives = async (urls) => {
        const archives = {};

        for (const url of urls) {
                const archive = await getArchive(url);
                archives[url] = archive;
        }

        return archives;
};
