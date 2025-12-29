import path from 'path';
import { EventEmitter } from 'eventemitter3';
import { ArtifactSaver } from '../../ArtifactSaver.js';

export class LogoScraperArtifactHandler {
    constructor(
        private baseDir: string,
        private emitter: EventEmitter
    ) {
        this.setupListeners();
    }

    private setupListeners() {
        this.emitter.on('logo:selected', async (data: { 
            url: string, 
            logos: any[], 
            brandColors: any[] 
        }) => {
            const safeUrl = data.url.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
            
            // Save analysis JSON
            const jsonPath = path.join(this.baseDir, 'analysis', `${safeUrl}_analysis.json`);
            await ArtifactSaver.save(JSON.stringify({ brandColors: data.brandColors, logos: data.logos }, null, 2), jsonPath);

            // Save top logos
            const logosDir = path.join(this.baseDir, 'logos', safeUrl);
            await Promise.all(data.logos.map(async (logo, i) => {
                const filename = `logo_${i + 1}.png`;
                const savePath = path.join(logosDir, filename);
                await ArtifactSaver.save(logo.base64PngData, savePath);
            }));
        });
    }
}
