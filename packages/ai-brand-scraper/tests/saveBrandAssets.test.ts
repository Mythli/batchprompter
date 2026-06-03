import { mkdtemp, readdir, readFile, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { saveBrandAssets } from '../demo/index.js';
import type { InteractiveElementsResult, LogoScraperResult } from '../src/index.js';

describe('saveBrandAssets', () => {
    it('writes logo PNGs, computed interactive styles, and a compact manifest', async () => {
        const outputDir = await mkdtemp(join(tmpdir(), 'ai-brand-assets-save-'));
        const pngDataUri = `data:image/png;base64,${Buffer.from('png-data').toString('base64')}`;
        const result = {
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
            stylesheets: [
                {
                    url: 'https://example.test/styles.css',
                    content: '.raw-logo { background-image: url("/logo.svg"); }',
                },
            ],
            cssSnippets: '.raw-logo { background-image: url("/logo.svg"); }',
        } as unknown as LogoScraperResult;
        const styleResult: InteractiveElementsResult = {
            compositeImageBase64: pngDataUri,
            screenshots: [
                {
                    type: 'button',
                    state: 'normal',
                    elementIndex: 1,
                    screenshotBase64: pngDataUri,
                    styles: 'background-color: rgb(11, 95, 255);\ncolor: rgb(255, 255, 255);',
                },
                {
                    type: 'button',
                    state: 'hover',
                    elementIndex: 1,
                    screenshotBase64: pngDataUri,
                    styles: 'background-color: rgb(0, 65, 200);',
                },
            ],
        };

        try {
            const saved = await saveBrandAssets({
                result,
                styleResult,
                outputDir,
                url: 'https://example.test',
                downloadedAt: '2026-06-03T12:00:00.000Z',
            });

            const manifest = JSON.parse(await readFile(saved.manifestPath, 'utf8'));
            const brandColors = JSON.parse(await readFile(saved.brandColorsPath, 'utf8'));
            const interactiveStyles = await readFile(join(outputDir, 'interactive-styles.md'), 'utf8');
            const writtenFiles = await listFiles(outputDir);

            await expect(stat(join(outputDir, 'logo-01-score-9.png'))).resolves.toBeTruthy();
            await expect(stat(join(outputDir, 'interactive-elements/composite.png'))).resolves.toBeTruthy();
            await expect(stat(join(outputDir, 'interactive-elements/01-button-01-normal.png'))).resolves.toBeTruthy();
            expect(saved.logos).toHaveLength(1);
            expect(manifest.logos[0].metadata.originalUrl).toBe('https://example.test/logo.svg');
            expect(manifest.logos[0].metadata.base64PngData).toBeUndefined();
            expect(manifest.interactiveStyle.reportPath).toBe(join(outputDir, 'interactive-styles.md'));
            expect(manifest.interactiveStyle.screenshots[0].type).toBe('button');
            expect(JSON.stringify(manifest)).not.toContain('stylesheets');
            expect(JSON.stringify(manifest)).not.toContain('cssSnippets');
            expect(JSON.stringify(manifest)).not.toContain('styles.css');
            expect(JSON.stringify(manifest)).not.toContain('background-image');
            expect(brandColors.primaryColor.hex).toBe('#0b5fff');
            expect(interactiveStyles).toContain('# Extracted Interactive Element Styles');
            expect(interactiveStyles).toContain('## button #1 (normal)');
            expect(interactiveStyles).toContain('background-color: rgb(11, 95, 255);');
            expect(writtenFiles.some(file => file.endsWith('.css'))).toBe(false);
            expect(writtenFiles.some(file => file.includes('/css/'))).toBe(false);
        } finally {
            await rm(outputDir, { recursive: true, force: true });
        }
    });
});

async function listFiles(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = await Promise.all(entries.map(async entry => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            return listFiles(path);
        }

        return [path];
    }));

    return files.flat();
}
