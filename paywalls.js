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

export const findPaywall = async (url) => {
        console.log('Launching browser');
        const browser = await puppeteer.launch();
        console.log('Generating new page');
        const page = await browser.newPage();
        console.log("Setting user agent on page");
        await page.setUserAgent(ASSUMED_USER_AGENT);
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
