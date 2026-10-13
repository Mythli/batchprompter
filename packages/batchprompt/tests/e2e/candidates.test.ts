import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { CandidateStrategy } from '../../src/strategies/CandidateStrategy.js';
import { setupTestEnvironment } from '../utils/testUtils.js';

describe('E2E Candidates with Judge', () => {
    it('should generate 3 candidates and use a judge to select the best one', async () => {
        // 1. Setup Mocks
        // We expect 3 generation calls (parallel) and 1 judge call (sequential after generation)
        const mockResponses = [
            "Option A: The Red Fox",   // Candidate 0
            "Option B: The Blue Dog",  // Candidate 1
            "Option C: The Green Cat", // Candidate 2
            // Judge Response (must match JudgeSchema: { best_candidate_index: number, reason: string })
            JSON.stringify({
                best_candidate_index: 1,
                reason: "Blue is a calming color."
            })
        ];

        const { executor, openai } = setupTestEnvironment({
            mockResponses
        });

        // 2. Define Config - model is now an object
        const config = {
            steps: [
                {
                    model: {
                        model: "gpt-mock",
                        prompt: "Generate a creative animal name"
                    },
                    candidates: 3,
                    judge: {
                        model: "gpt-judge",
                        prompt: "Select the most creative name."
                    },
                    output: {
                        mode: "column",
                        column: "bestName"
                    }
                }
            ]
        };

        const initialRows = [{ id: 1 }];

        // 3. Execute
        const { results } = await executor.runConfig(config, initialRows);

        // 4. Verify Results
        expect(results).toHaveLength(1);
        // The judge selected index 1 ("Option B: The Blue Dog")
        expect(results[0].bestName).toBe("Option B: The Blue Dog");

        // 5. Verify LLM Calls
        const createCall = (openai.chat.completions.create as any);
        // 3 candidates + 1 judge = 4 calls
        expect(createCall).toHaveBeenCalledTimes(4);

        // Verify the judge call (last one)
        const judgeCallArgs = createCall.mock.calls[3][0];
        const messages = judgeCallArgs.messages;
        
        // The judge prompt should contain the candidates
        const fullContent = JSON.stringify(messages);
        expect(fullContent).toContain("Option A: The Red Fox");
        expect(fullContent).toContain("Option B: The Blue Dog");
        expect(fullContent).toContain("Option C: The Green Cat");
    });

    it('should downscale data URL images for the judge without changing the selected output', async () => {
        const largeImage = await sharp({
            create: {
                width: 2048,
                height: 2048,
                channels: 3,
                background: { r: 10, g: 20, b: 30 }
            }
        }).png({ compressionLevel: 0 }).toBuffer();
        const largeDataUrl = `data:image/png;base64,${largeImage.toString('base64')}`;
        const judgeResponse = JSON.stringify({
            best_candidate_index: 1,
            reason: 'Candidate 1 is strongest.'
        });

        const { executor, openai } = setupTestEnvironment({
            mockResponses: [largeDataUrl, largeDataUrl, judgeResponse]
        });
        const config = {
            steps: [{
                model: { model: 'gpt-mock', prompt: 'Generate an icon' },
                candidates: 2,
                judge: { model: 'gpt-judge', prompt: 'Select the best icon.' },
                output: { mode: 'column', column: 'icon' }
            }]
        };

        const { results } = await executor.runConfig(config, [{ id: 1 }]);

        expect(results[0].icon).toBe(largeDataUrl);
        const judgeCall = (openai.chat.completions.create as any).mock.calls[2][0];
        const judgeImages = judgeCall.messages
            .flatMap((message: any) => Array.isArray(message.content) ? message.content : [])
            .filter((part: any) => part.type === 'image_url')
            .map((part: any) => part.image_url.url);
        expect(judgeImages).toHaveLength(2);
        expect(judgeImages.every((url: string) => url.length < largeDataUrl.length)).toBe(true);

        const judgeBuffer = Buffer.from(judgeImages[0].split(',')[1], 'base64');
        const metadata = await sharp(judgeBuffer).metadata();
        expect(metadata.width).toBeLessThanOrEqual(512);
        expect(metadata.height).toBeLessThanOrEqual(512);
    });

    it('should prepare and preserve binary image candidates', async () => {
        const largeImage = await sharp({
            create: {
                width: 2048,
                height: 2048,
                channels: 3,
                background: { r: 40, g: 50, b: 60 }
            }
        }).png({ compressionLevel: 0 }).toBuffer();
        const outputDir = await import('node:fs/promises').then(fs => fs.mkdtemp('/tmp/batchprompt-candidate-'));
        const strategy = new CandidateStrategy({} as any, {
            getTempDir: async () => outputDir,
            getEvents: () => ({ emit: () => undefined })
        } as any);

        const judgeUrl = await (strategy as any).prepareJudgeImage(largeImage);
        expect(judgeUrl).toMatch(/^data:image\/jpeg;base64,/);
        const judgeBuffer = Buffer.from(judgeUrl.split(',')[1], 'base64');
        const judgeMetadata = await sharp(judgeBuffer).metadata();
        expect(judgeMetadata.width).toBeLessThanOrEqual(512);
        expect(judgeMetadata.height).toBeLessThanOrEqual(512);

        await (strategy as any).persistImageCandidate({ items: [{ data: largeImage }] }, 0);
        const preserved = await import('node:fs/promises').then(fs => fs.readFile(`${outputDir}/candidate-01.png`));
        expect(preserved.equals(largeImage)).toBe(true);
    });
});
