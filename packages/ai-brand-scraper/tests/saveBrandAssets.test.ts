import { mkdtemp, readFile, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { saveBrandAssets } from '../demo/index.js';
import type { LogoScraperResult } from '../src/index.js';

describe('saveBrandAssets', () => {
    it('writes logo PNGs and a compact manifest', async () => {
        const outputDir = await mkdtemp(join(tmpdir(), 'ai-brand-assets-save-'));
        const pngDataUri = `data:image/png;base64,${Buffer.from('png-data').toString('base64')}`;
        const result: LogoScraperResult = {
            primaryColor: { hex: '#0b5fff', isDark: true, contrastColor: '#ffffff' },
            brandColors: [
                { hex: '#0b5fff', isDark: true, contrastColor: '#ffffff' },
            ],
            logos: [
                {
                    originalUrl: 'https://example.test/logo.svg',
                    base64PngData: pngDataUri,
                    originalFileType: 'svg',
                    outputMimeType: 'image/png',
                    width: 180,
                    height: 60,
                    outputPngFileSize: 8,
                    isFavicon: false,
                    brandLogoScore: 9,
                    duplicateOfIndex: null,
                    originalIndex: 0,
                },
            ],
        };

        try {
            const saved = await saveBrandAssets({
                result,
                outputDir,
                url: 'https://example.test',
                downloadedAt: '2026-06-03T12:00:00.000Z',
            });

            const manifest = JSON.parse(await readFile(saved.manifestPath, 'utf8'));
            const brandColors = JSON.parse(await readFile(saved.brandColorsPath, 'utf8'));

            await expect(stat(join(outputDir, 'logo-01-score-9.png'))).resolves.toBeTruthy();
            expect(saved.logos).toHaveLength(1);
            expect(manifest.logos[0].metadata.originalUrl).toBe('https://example.test/logo.svg');
            expect(manifest.logos[0].metadata.base64PngData).toBeUndefined();
            expect(brandColors.primaryColor.hex).toBe('#0b5fff');
        } finally {
            await rm(outputDir, { recursive: true, force: true });
        }
    });
});
