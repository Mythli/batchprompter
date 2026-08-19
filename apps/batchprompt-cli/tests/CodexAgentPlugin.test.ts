import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { setupTestEnvironment } from '../../../packages/batchprompt/tests/utils/testUtils.js';
import {
    buildCodexArgs,
    CodexAgentPlugin,
    type CodexAgentRunner,
    type CodexAgentRunOptions
} from '../src/plugins/CodexAgentPlugin.js';

describe('CodexAgentPlugin', () => {
    it('hydrates row fields, parses structured output, and feeds it to the next step', async () => {
        const runner: CodexAgentRunner = {
            run: vi.fn(async (options: CodexAgentRunOptions) => {
                expect(options.prompt).toBe('Analyze Acme Robotics for warehouse teams.');
                expect(options.workingDirectory).toBe('/work/acme');
                expect(options.outputSchemaPath).toMatch(/codex-output-schema\.json$/);
                const schema = JSON.parse(await fs.readFile(options.outputSchemaPath!, 'utf8'));
                expect(schema.required).toEqual(['summary', 'confidence']);
                return {
                    finalMessage: JSON.stringify({
                        summary: 'Acme automates warehouse movement.',
                        confidence: 0.91
                    }),
                    usage: { input_tokens: 100, output_tokens: 20 }
                };
            })
        };

        const plugin = new CodexAgentPlugin(runner);
        const { executor, openai } = setupTestEnvironment({
            plugins: [plugin],
            mockResponses: ['Downstream result']
        });

        const { results } = await executor.runConfig({
            steps: [
                {
                    plugins: [{
                        type: 'codexAgent',
                        prompt: 'Analyze {{company}} for {{audience}}.',
                        workingDirectory: '/work/{{slug}}',
                        outputSchema: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                summary: { type: 'string' },
                                confidence: { type: 'number' }
                            },
                            required: ['summary', 'confidence']
                        },
                        output: {
                            mode: 'column',
                            column: 'codex'
                        }
                    }]
                },
                {
                    model: {
                        model: 'gpt-mock',
                        prompt: 'Continue from {{codex.summary}} with confidence {{codex.confidence}}.'
                    },
                    output: {
                        mode: 'column',
                        column: 'downstream'
                    }
                }
            ]
        }, [{
            company: 'Acme Robotics',
            audience: 'warehouse teams',
            slug: 'acme'
        }]);

        expect(results).toEqual([{
            company: 'Acme Robotics',
            audience: 'warehouse teams',
            slug: 'acme',
            codex: {
                summary: 'Acme automates warehouse movement.',
                confidence: 0.91
            },
            downstream: 'Downstream result'
        }]);

        expect(runner.run).toHaveBeenCalledTimes(1);
        const modelCall = (openai.chat.completions.create as any).mock.calls[0][0];
        const renderedMessages = JSON.stringify(modelCall.messages);
        expect(renderedMessages).toContain('Acme automates warehouse movement.');
        expect(renderedMessages).toContain('0.91');
    });

    it('places global Codex options before exec and passes the prompt through stdin', () => {
        const options: CodexAgentRunOptions = {
            executable: 'codex',
            prompt: 'Hello',
            workingDirectory: '/work/repo',
            additionalDirectories: ['/work/shared'],
            images: ['/work/image.png'],
            model: 'gpt-test',
            profile: 'batch',
            sandbox: 'read-only',
            approvalPolicy: 'never',
            search: true,
            ephemeral: true,
            ignoreUserConfig: true,
            skipGitRepoCheck: false,
            configOverrides: ['model_reasoning_effort="high"'],
            outputSchemaPath: '/tmp/schema.json',
            timeoutMs: 10_000
        };

        expect(buildCodexArgs(options)).toEqual([
            '--ask-for-approval', 'never',
            '--profile', 'batch',
            '--search',
            'exec',
            '--sandbox', 'read-only',
            '--color', 'never',
            '--json',
            '--ephemeral',
            '--ignore-user-config',
            '--cd', '/work/repo',
            '--model', 'gpt-test',
            '--add-dir', '/work/shared',
            '--image', '/work/image.png',
            '--config', 'model_reasoning_effort="high"',
            '--output-schema', '/tmp/schema.json',
            '-'
        ]);
    });
});
