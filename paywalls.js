const puppeteer = require('puppeteer');

const ASSUMED_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';

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

const hasPaywallAttribute = (document, debug = false) => {
	if (debug) {
	        for (const prop in document) {
        	        console.log("Document has prop", prop);
	        }
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

const hasPaywallAttributePage = async (page, debug = false) => {
        for (const attributeName in PAYWALL_ATTRIBUTES) {
                const attribute = PAYWALL_ATTRIBUTES[attributeName];
                if (!attribute.contains) {
                        continue;
                }

                for (const value of attribute.contains) {
                        const lower = value.toLowerCase();
                        const selector = `[${attributeName}*="${value}"], [${attributeName}*="${lower}"]`;

                        const element = await page.$(selector);

                        if (debug) {
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

export const findPaywall = async (url, debug = false) => {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.setUserAgent(ASSUMED_USER_AGENT);
	if (debug) {
	        console.log(`Going to url ${url}`);
	}
        await page.goto(url, { timeout: 120000, waitUntil: 'networkidle2' });

	// TODO: Use env variable to determine if we scrape statically or use puppeteer
        if (await hasPaywallAttributePage(page, debug)) {
                return true;
        }

        // Should likely switch to page.evaluate(() => document.body.textContent and go from there
        const textContent = await page.content();

        return hasPaywallKeyword(textContent);
};
