import { getConfig } from '../getConfig.js';
import { RuntimeConfig, StepConfig } from '../types.js';
import { LeadGenRequestSchema } from './schemas.js';
import { z } from 'zod';
import path from 'path';
import os from 'os';

type LeadGenRequest = z.infer<typeof LeadGenRequestSchema>;

export async function runLeadGenPipeline(request: LeadGenRequest, onResult: (result: any) => void) {
    const { actionRunner, globalContext } = await getConfig();
    
    const tmpDir = path.join(os.tmpdir(), 'batchprompt-api', Date.now().toString());

    // Step 1: Find (Web Search)
    const findStep: StepConfig = {
        modelConfig: {
            model: globalContext.defaultModel,
            temperature: 0.7,
            systemParts: [],
            promptParts: [],
            thinkingLevel: 'medium'
        },
        tmpDir,
        userPromptParts: [],
        output: { mode: 'merge', explode: true },
        candidates: 1,
        noCandidateCommand: false,
        feedbackLoops: 0,
        plugins: [
            {
                name: 'web-search',
                config: {
                    type: 'web-search',
                    queryPrompt: "Generate 3 distinct search queries to find: {{objective}}",
                    selectPrompt: "Select the most relevant results for: {{objective}}",
                    limit: request.limit,
                    queryCount: 3,
                    maxPages: 1,
                    dedupeStrategy: 'domain',
                    output: { mode: 'merge', explode: true }
                },
                output: { mode: 'merge', explode: true }
            }
        ],
        preprocessors: [],
        timeout: 300
    };

    // Step 2: Enrich (Website Agent)
    const enrichStep: StepConfig = {
        modelConfig: {
            model: globalContext.defaultModel,
            temperature: 0,
            systemParts: [],
            promptParts: [],
            thinkingLevel: 'medium'
        },
        tmpDir,
        userPromptParts: [],
        output: { mode: 'merge', explode: false },
        candidates: 1,
        noCandidateCommand: false,
        feedbackLoops: 0,
        plugins: [
            {
                name: 'website-agent',
                config: {
                    type: 'website-agent',
                    url: '{{link}}',
                    schema: request.extractionSchema,
                    budget: 5,
                    output: { mode: 'merge' }
                },
                output: { mode: 'merge', explode: false }
            }
        ],
        preprocessors: [],
        timeout: 600
    };

    const config: RuntimeConfig = {
        concurrency: 10,
        taskConcurrency: 5,
        tmpDir,
        steps: [findStep, enrichStep],
        data: [{ objective: request.objective }]
    };

    // Listen for results
    const resultHandler = (payload: { index: number, result: any }) => {
        onResult(payload.result);
    };

    globalContext.events.on('row:end', resultHandler);

    try {
        await actionRunner.run(config);
    } finally {
        globalContext.events.off('row:end', resultHandler);
    }
}
