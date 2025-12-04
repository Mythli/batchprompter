import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static'
import { cors } from 'hono/cors';
import { getConfig } from "./getConfig.js";
import dotenv from 'dotenv';
// @ts-ignore
import packageInfo from '../package.json' with { type: 'json' };
import { registerCompanyInfoRoute } from "./routes/registerCompanyInfo.js";
import { registerIsCustomDomainRoute } from "./routes/registerIsCustomDomain.js";
import { registerIsValidEmailRoute } from "./routes/registerIsValidEmail.js";

dotenv.config();

const main = async () => {
    const { config, isCustomDomain, puppeteerHelper, buildAiWebsiteInfoScraper, buildAiLogoScraper, verifyEmail, companyInfoQueue } = await getConfig();

    const app = new Hono<{}>();

    // Enable CORS for all routes
    app.use('*', cors());

    // Serve static files from the configured TMP_DIR/public directory.
    // A request to /public/some-id/style.css will be rewritten to /tmp/public/some-id/style.css
    // and serve the file from the root of the project.
    app.use(
        '/public/*',
        serveStatic({
            root: './',
            rewriteRequestPath: (path) => path.replace(/^\/public/, `/${config.TMP_DIR}/public`),
        })
    );


    registerCompanyInfoRoute({ app, buildInfoScraper: buildAiWebsiteInfoScraper, buildLogoScraper: buildAiLogoScraper, companyInfoQueue });
    registerIsCustomDomainRoute({ app, isCustomDomain });
    registerIsValidEmailRoute({ app, verifyEmail });

    app.get('/version', (c) => {
        if (packageInfo?.version) {
            return c.json({ version: packageInfo.version });
        }
        console.error("Could not read version from package.json or packageInfo is malformed.");
        return c.json({ error: 'Version information unavailable' }, 500);
    });

    // Serve on port 3000 with Node.js
    const port = config.PORT;
    const server = serve({
        fetch: app.fetch,
        port
    }, () => console.log(`Server running on http://localhost:${port}`));

    const shutdown = async () => {
        console.log('Gracefully shutting down...');
        server.close();
        await puppeteerHelper.close();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main();
