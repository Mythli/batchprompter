import { describe, it, expect } from 'vitest';
import { setupTestEnvironment } from '../utils/testUtils.js';
import path from 'path';

describe('E2E Image Generation', () => {
    // TODO: Image artifact handling is not fully implemented yet.
    // This test needs to be revisited once artifact emission is added to StandardStrategy.
    it.skip('should generate an image and save it with a Handlebars filename', async () => {
        // 1. Setup Mocks
        // A valid 1x1 red pixel PNG base64
        const validBase64Image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
        const mockImageUrl = `data:image/png;base64,${validBase64Image}`;

        // Mock an image response from OpenAI
        // Use standard content array format which StandardStrategy.extractContent understands
        const mockImageResponse = {
            content: [{
                type: 'image_url',
                image_url: { url: mockImageUrl }
            }]
        };
        
        const { executor } = setupTestEnvironment({
            mockResponses: [mockImageResponse]
        });

        // 2. Define Config with Handlebars output path - model is now an object
        const config = {
            tmpDir: "/tmp/batchprompt",
            steps: [
                {
                    model: {
                        model: "dall-e-3",
                        prompt: "Generate a logo for {{company}}"
                    },
                    // Handlebars template for output filename
                    output: {
                        mode: "ignore",
                        path: "out/logos/{{company}}_logo.png"
                    }
                }
            ]
        };

        const initialRows = [{ company: "AcmeCorp" }];

        // 3. Execute
        const { results, artifacts } = await executor.runConfig(config, initialRows);

        // 4. Verify Results
        expect(results).toHaveLength(1);
        
        // 5. Verify Artifacts
        // We expect one artifact: the generated image
        expect(artifacts).toHaveLength(1);
        
        const artifact = artifacts[0];
        expect(artifact.type).toBe('image');
        expect(artifact.content).toBeTruthy(); // Ensure content is not empty
        
        // Check if the filename was correctly resolved using Handlebars
        expect(artifact.path).toContain(path.join('out', 'logos', 'AcmeCorp_logo.png'));
        
        // Check content (mocked URL)
        expect(artifact.content).toBe(mockImageUrl);
    });
});
