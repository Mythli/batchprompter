import { describe, it, expect } from 'vitest';
import { InMemoryConfigExecutor } from '../../src/generator/InMemoryConfigExecutor.js';
import { ActionRunner } from '../../src/ActionRunner.js';
import { PluginRegistryV2 } from '../../src/plugins/types.js';
import { LlmClientFactory } from '../../src/core/LlmClientFactory.js';
import { StepResolver } from '../../src/core/StepResolver.js';
import { MessageBuilder } from '../../src/core/MessageBuilder.js';
import { createTestContext } from '../utils/testHelpers.js';
import path from 'path';

describe('E2E Image Generation', () => {
    it('should generate an image and save it with a Handlebars filename', async () => {
        // 1. Setup Mocks
        // A valid 1x1 red pixel PNG base64
        const validBase64Image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
        const mockImageUrl = `data:image/png;base64,${validBase64Image}`;

        // Mock an image response from OpenAI
        const mockImageResponse = {
            content: null,
            images: [{
                image_url: { url: mockImageUrl }
            }]
        };
        
        const { globalContext, openai, events, contentResolver } = createTestContext([mockImageResponse]);

        // 2. Setup Core Components
        const llmFactory = new LlmClientFactory(openai, globalContext.gptQueue, 'gpt-mock');
        
        const schemaLoader = {
            load: async () => ({})
        };

        const stepResolver = new StepResolver(llmFactory, globalContext, schemaLoader);
        const messageBuilder = new MessageBuilder();
        const pluginRegistry = new PluginRegistryV2();

        const actionRunner = new ActionRunner(
            globalContext,
            pluginRegistry,
            stepResolver,
            messageBuilder
        );

        const executor = new InMemoryConfigExecutor(
            actionRunner,
            pluginRegistry,
            events,
            contentResolver
        );

        // 3. Define Config with Handlebars output path
        const config = {
            globals: {
                model: "dall-e-3",
                // Global temp dir
                tmpDir: "/tmp/batchprompt"
            },
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
        
        // Check if the filename was correctly resolved using Handlebars
        // Note: StepResolver resolves to absolute path. 
        // Since we didn't mock path.resolve fully, it will use the system's path logic.
        // We check if it ends with the expected structure.
        expect(artifact.path).toContain(path.join('out', 'logos', 'AcmeCorp_logo.png'));
        
        // Check content (mocked URL)
        expect(artifact.content).toBe(mockImageUrl);
    });
});
