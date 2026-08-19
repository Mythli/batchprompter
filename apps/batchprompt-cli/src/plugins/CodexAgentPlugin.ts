import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import Handlebars from 'handlebars';
import { z } from 'zod';
import {
    BasePlugin,
    BasePluginRow,
    PartialOutputConfigSchema,
    PluginResult,
    renderSchemaObject,
    StepRow,
    zHandlebars,
    zJsonSchemaObject
} from 'batchprompt';
import type { GlobalConfig, StepConfig } from 'batchprompt';

export const CodexAgentConfigSchema = z.object({
    type: z.literal('codexAgent'),
    id: z.string().optional(),
    output: PartialOutputConfigSchema.optional(),
    prompt: zHandlebars.describe('Instructions passed to the Codex agent through stdin.'),
    executable: z.string().min(1).default('codex'),
    workingDirectory: zHandlebars.optional(),
    additionalDirectories: z.array(zHandlebars).default([]),
    images: z.array(zHandlebars).default([]),
    model: zHandlebars.optional(),
    profile: zHandlebars.optional(),
    sandbox: z.enum(['read-only', 'workspace-write', 'danger-full-access']).default('read-only'),
    approvalPolicy: z.enum(['untrusted', 'on-request', 'never']).default('never'),
    search: z.boolean().default(false),
    ephemeral: z.boolean().default(true),
    ignoreUserConfig: z.boolean().default(false),
    skipGitRepoCheck: z.boolean().default(false),
    configOverrides: z.array(zHandlebars).default([]),
    outputSchema: zJsonSchemaObject.optional(),
    resultFormat: z.enum(['text', 'json']).optional(),
    timeoutMs: z.number().int().positive().default(600_000)
}).strict();

export type CodexAgentConfig = z.output<typeof CodexAgentConfigSchema>;

export interface CodexAgentRunOptions {
    executable: string;
    prompt: string;
    workingDirectory?: string;
    additionalDirectories: string[];
    images: string[];
    model?: string;
    profile?: string;
    sandbox: CodexAgentConfig['sandbox'];
    approvalPolicy: CodexAgentConfig['approvalPolicy'];
    search: boolean;
    ephemeral: boolean;
    ignoreUserConfig: boolean;
    skipGitRepoCheck: boolean;
    configOverrides: string[];
    outputSchemaPath?: string;
    timeoutMs: number;
    onEvent?: (event: Record<string, any>) => void;
}

export interface CodexAgentRunResult {
    finalMessage: string;
    threadId?: string;
    usage?: Record<string, any>;
}

export interface CodexAgentRunner {
    run(options: CodexAgentRunOptions): Promise<CodexAgentRunResult>;
}

export function buildCodexArgs(options: CodexAgentRunOptions): string[] {
    const args: string[] = [];

    // In codex-cli 0.145.0 these are global options and must precede `exec`.
    args.push('--ask-for-approval', options.approvalPolicy);
    if (options.profile) args.push('--profile', options.profile);
    if (options.search) args.push('--search');

    args.push('exec');
    args.push('--sandbox', options.sandbox);
    args.push('--color', 'never');
    args.push('--json');

    if (options.ephemeral) args.push('--ephemeral');
    if (options.ignoreUserConfig) args.push('--ignore-user-config');
    if (options.skipGitRepoCheck) args.push('--skip-git-repo-check');
    if (options.workingDirectory) args.push('--cd', options.workingDirectory);
    if (options.model) args.push('--model', options.model);

    for (const directory of options.additionalDirectories) {
        args.push('--add-dir', directory);
    }
    for (const image of options.images) {
        args.push('--image', image);
    }
    for (const override of options.configOverrides) {
        args.push('--config', override);
    }
    if (options.outputSchemaPath) {
        args.push('--output-schema', options.outputSchemaPath);
    }

    // A lone dash makes Codex read the hydrated prompt from stdin.
    args.push('-');
    return args;
}

function appendTail(current: string, chunk: string, maxLength = 1_000_000): string {
    const next = current + chunk;
    return next.length > maxLength ? next.slice(-maxLength) : next;
}

export class SpawnCodexAgentRunner implements CodexAgentRunner {
    async run(options: CodexAgentRunOptions): Promise<CodexAgentRunResult> {
        const args = buildCodexArgs(options);

        return new Promise<CodexAgentRunResult>((resolve, reject) => {
            const child = spawn(options.executable, args, {
                env: process.env,
                shell: false,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let settled = false;
            let timedOut = false;
            let stdoutBuffer = '';
            let stdoutTail = '';
            let stderrTail = '';
            let finalMessage: string | undefined;
            let threadId: string | undefined;
            let usage: Record<string, any> | undefined;
            let forceKillTimer: NodeJS.Timeout | undefined;

            const handleLine = (line: string) => {
                const trimmed = line.trim();
                if (!trimmed) return;

                try {
                    const event = JSON.parse(trimmed) as Record<string, any>;
                    options.onEvent?.(event);

                    if (event.type === 'thread.started' && typeof event.thread_id === 'string') {
                        threadId = event.thread_id;
                    }
                    if (
                        event.type === 'item.completed'
                        && event.item?.type === 'agent_message'
                        && typeof event.item.text === 'string'
                    ) {
                        finalMessage = event.item.text;
                    }
                    if (event.type === 'turn.completed' && event.usage && typeof event.usage === 'object') {
                        usage = event.usage;
                    }
                } catch {
                    // Keep non-JSON stdout in the diagnostic tail. Successful JSONL
                    // executions still resolve from the final agent_message event.
                }
            };

            child.stdout.setEncoding('utf8');
            child.stdout.on('data', (chunk: string) => {
                stdoutTail = appendTail(stdoutTail, chunk);
                stdoutBuffer += chunk;

                let newlineIndex = stdoutBuffer.indexOf('\n');
                while (newlineIndex >= 0) {
                    handleLine(stdoutBuffer.slice(0, newlineIndex));
                    stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
                    newlineIndex = stdoutBuffer.indexOf('\n');
                }
            });

            child.stderr.setEncoding('utf8');
            child.stderr.on('data', (chunk: string) => {
                stderrTail = appendTail(stderrTail, chunk);
            });

            const timeout = setTimeout(() => {
                timedOut = true;
                child.kill('SIGTERM');
                forceKillTimer = setTimeout(() => child.kill('SIGKILL'), 2_000);
                forceKillTimer.unref();
            }, options.timeoutMs);
            timeout.unref();

            child.once('error', (error) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                if (forceKillTimer) clearTimeout(forceKillTimer);
                reject(new Error(`Failed to start Codex executable '${options.executable}': ${error.message}`));
            });

            child.once('close', (code, signal) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                if (forceKillTimer) clearTimeout(forceKillTimer);
                handleLine(stdoutBuffer);

                if (timedOut) {
                    reject(new Error(`Codex agent timed out after ${options.timeoutMs}ms`));
                    return;
                }
                if (code !== 0) {
                    const diagnostics = stderrTail.trim() || stdoutTail.trim() || `signal ${signal ?? 'unknown'}`;
                    reject(new Error(`Codex agent exited with code ${code}: ${diagnostics}`));
                    return;
                }
                if (finalMessage === undefined) {
                    reject(new Error(`Codex agent completed without a final agent message. Output: ${stdoutTail.trim()}`));
                    return;
                }

                resolve({ finalMessage, threadId, usage });
            });

            child.stdin.once('error', () => {
                // Process startup/exit handlers provide the actionable error.
            });
            child.stdin.end(options.prompt);
        });
    }
}

function render(template: string | undefined, context: Record<string, any>): string | undefined {
    if (template === undefined) return undefined;
    return Handlebars.compile(template, { noEscape: true })(context);
}

class CodexAgentPluginRow extends BasePluginRow<CodexAgentConfig> {
    constructor(
        stepRow: StepRow,
        config: CodexAgentConfig,
        private readonly runner: CodexAgentRunner
    ) {
        super(stepRow, config);
    }

    async prepare(): Promise<PluginResult> {
        const history = await this.stepRow.getPreparedMessages();
        let outputSchemaPath: string | undefined;

        try {
            if (this.config.outputSchema) {
                const tempDir = await this.stepRow.getTempDir();
                outputSchemaPath = path.resolve(tempDir, 'codex-output-schema.json');
                await fs.writeFile(outputSchemaPath, JSON.stringify(this.config.outputSchema, null, 2), 'utf8');
            }

            const result = await this.runner.run({
                executable: this.config.executable,
                prompt: this.config.prompt,
                workingDirectory: this.config.workingDirectory,
                additionalDirectories: this.config.additionalDirectories,
                images: this.config.images,
                model: this.config.model,
                profile: this.config.profile,
                sandbox: this.config.sandbox,
                approvalPolicy: this.config.approvalPolicy,
                search: this.config.search,
                ephemeral: this.config.ephemeral,
                ignoreUserConfig: this.config.ignoreUserConfig,
                skipGitRepoCheck: this.config.skipGitRepoCheck,
                configOverrides: this.config.configOverrides,
                outputSchemaPath,
                timeoutMs: this.config.timeoutMs,
                onEvent: (event) => {
                    this.stepRow.getEvents().emit('plugin:event', {
                        row: this.stepRow.getOriginalIndex(),
                        step: this.stepRow.step.stepIndex,
                        plugin: 'codexAgent',
                        event: event.type || 'event',
                        data: event
                    });
                }
            });

            let data: any = result.finalMessage;
            if (this.config.outputSchema || this.config.resultFormat === 'json') {
                try {
                    data = JSON.parse(result.finalMessage);
                } catch (error: any) {
                    throw new Error(`Codex agent returned invalid JSON: ${error.message}`);
                }
            }

            return {
                history,
                items: [{ data, contentParts: [] }]
            };
        } finally {
            if (outputSchemaPath) {
                await fs.unlink(outputSchemaPath).catch(() => {});
            }
        }
    }
}

export class CodexAgentPlugin extends BasePlugin<CodexAgentConfig, CodexAgentConfig> {
    readonly type = 'codexAgent';

    constructor(private readonly runner: CodexAgentRunner = new SpawnCodexAgentRunner()) {
        super();
    }

    getSchema() {
        return CodexAgentConfigSchema;
    }

    normalizeConfig(config: CodexAgentConfig, stepConfig: StepConfig, globalConfig: GlobalConfig): CodexAgentConfig {
        const base = super.normalizeConfig(config, stepConfig, globalConfig);
        return {
            ...base,
            id: config.id ?? `codex-agent-${Date.now()}`
        };
    }

    hydrate(
        _stepConfig: StepConfig,
        _globalConfig: GlobalConfig,
        config: CodexAgentConfig,
        context: Record<string, any>
    ): CodexAgentConfig {
        return {
            ...config,
            prompt: render(config.prompt, context)!,
            workingDirectory: render(config.workingDirectory, context),
            additionalDirectories: config.additionalDirectories.map(value => render(value, context)!),
            images: config.images.map(value => render(value, context)!),
            model: render(config.model, context),
            profile: render(config.profile, context),
            configOverrides: config.configOverrides.map(value => render(value, context)!),
            outputSchema: config.outputSchema
                ? renderSchemaObject(config.outputSchema, context)
                : undefined
        };
    }

    createRow(stepRow: StepRow, config: CodexAgentConfig): BasePluginRow<CodexAgentConfig> {
        return new CodexAgentPluginRow(stepRow, config, this.runner);
    }
}
