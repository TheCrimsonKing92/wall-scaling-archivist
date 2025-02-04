const { request } = require('undici');

const getPage = async (url, debug = false, trace = false) => {
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

export const getPages = async (urls) => {
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
