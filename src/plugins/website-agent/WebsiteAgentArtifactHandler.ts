import path from 'path';
import { EventEmitter } from 'eventemitter3';
import { ArtifactSaver } from '../../ArtifactSaver.js';

export class WebsiteAgentArtifactHandler {
    constructor(
        private baseDir: string,
        private emitter: EventEmitter
    ) {
        this.setupListeners();
    }

    private setupListeners() {
        // 1. Scraped Pages (Markdown)
        this.emitter.on('page:scraped', async (data: { url: string, markdown: string }) => {
            const safeUrl = data.url.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
            const filename = `${safeUrl}_${Date.now()}.md`;
            const savePath = path.join(this.baseDir, 'pages', filename);
            await ArtifactSaver.save(data.markdown, savePath);
        });

        // 2. Data Extractions (JSON)
        this.emitter.on('data:extracted', async (data: { url: string, data: any }) => {
            const safeUrl = data.url.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
            const filename = `${safeUrl}_${Date.now()}.json`;
            const savePath = path.join(this.baseDir, 'extractions', filename);
            await ArtifactSaver.save(JSON.stringify(data.data, null, 2), savePath);
        });

        // 3. Navigation Decisions (JSON)
        this.emitter.on('decision:made', async (data: { findings: any[], links: any[], response: any }) => {
            const filename = `decision_${Date.now()}.json`;
            const savePath = path.join(this.baseDir, 'decisions', filename);
            await ArtifactSaver.save(JSON.stringify(data, null, 2), savePath);
        });

        // 4. Final Merged Result (JSON)
        this.emitter.on('results:merged', async (data: { results: any[], merged: any }) => {
            const filename = `final_merge_${Date.now()}.json`;
            const savePath = path.join(this.baseDir, 'final', filename);
            await ArtifactSaver.save(JSON.stringify(data, null, 2), savePath);
        });
    }
}
