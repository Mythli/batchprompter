/*
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { SingleFilePageGenerator } from "../lib/generateSingleFilePage/SingleFilePageGenerator.js";
import * as path from 'path';
import * as fs from "fs/promises";
import { PuppeteerPageHelper } from "../lib/PupeteerPageHelper.js";

export interface ProxyHtmlDependencies {
    app: Hono<any>;
    buildSingleFilePageGenerator: () => { generator: SingleFilePageGenerator, outputDir: string };
}

const inputSchema = z.object({
    url: z.string().url({ message: "A valid URL is required" }),
});

/!**
 * Registers a Hono route that downloads a website to a local folder
 * and redirects the user to the statically served version.
 * @param deps - The application dependencies, including the Hono app and the generator factory.
 *!/
export function registerProxyHtmlRoute(deps: ProxyHtmlDependencies): void {
    const { app, buildSingleFilePageGenerator } = deps;

    app.get('/render-html', zValidator('query', inputSchema), async (c) => {
        const { url } = c.req.valid('query');
        console.log(`[API GET] Received request to generate file-based page for: ${url}`);

        let pageHelper: PuppeteerPageHelper | null = null;

        try {
            const { generator, outputDir } = buildSingleFilePageGenerator();
            pageHelper = await generator.generate({ type: 'url', value: url });

            const finalHtml = await pageHelper.getFinalHtml();
            const indexPath = path.join(outputDir, 'index.html');
            await fs.mkdir(path.dirname(indexPath), { recursive: true });
            await fs.writeFile(indexPath, finalHtml);
            console.log(`[File Saver] Saved index.html to ${indexPath}`);

            const id = path.basename(outputDir);
            const servePath = `/public/${id}/index.html`;
            console.log(`[API GET] Successfully generated files. Serving in an iframe at ${servePath}`);

            const iframeHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rendered Page: ${url}</title>
    <style>
        body, html {
            margin: 0;
            padding: 0;
            height: 100%;
            overflow: hidden;
        }
        iframe {
            border: none;
            width: 100%;
            height: 100%;
        }
    </style>
</head>
<body>
    <iframe src="${servePath}"></iframe>
</body>
</html>`;

            return c.html(iframeHtml);

        } catch (error: any) {
            console.error(`[API GET] Error during processing for ${url}:`, error);
            return c.json(
                {
                    error: "Failed to fetch or process the page.",
                    message: error.message,
                },
                500
            );
        } finally {
            if (pageHelper) {
                await pageHelper.close();
            }
        }
    });
}
*/
