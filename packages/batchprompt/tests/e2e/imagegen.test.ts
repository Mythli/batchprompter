import { describe, it, expect } from 'vitest';
import { setupTestEnvironment } from '../utils/testUtils.js';
import path from 'path';

describe('E2E Image Generation', () => {
    it('should generate an image and save it with a Handlebars filename', async () => {
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

        // 3. Define Config with Handlebars output path
        const config = {
            model: "dall-e-3",
            tmpDir: "/tmp/batchprompt",
            steps: [
                {
                    prompt: "Generate a logo for {{company}}",
                    // Handlebars template for output filename
                    outputPath: "out/logos/{{company}}_logo.png",
                    output: {
                        mode: "ignore" // We check artifacts, not row data
                    }
                }
            ]
        };

        const initialRows = [{ company: "AcmeCorp" }];

        // 4. Execute
        const { results, artifacts } = await executor.runConfig(config, initialRows);

        // 5. Verify Results
        expect(results).toHaveLength(1);
        
        // 6. Verify Artifacts
        // We expect one artifact: the generated image
        expect(artifacts).toHaveLength(1);
        
        const artifact = artifacts[0];
        expect(artifact.type).toBe('image');
        expect(artifact.content).toBeTruthy(); // Ensure content is not empty
        
        // Check if the filename was correctly resolved using Handlebars
        // Note: StepResolver resolves to absolute path. 
        // Since we didn't mock path.resolve fully, it will use the system's path logic.
        // We check if it ends with the expected structure.
        expect(artifact.path).toContain(path.join('out', 'logos', 'AcmeCorp_logo.png'));
        
        // Check content (mocked URL)
        expect(artifact.content).toBe(mockImageUrl);
    });
});
