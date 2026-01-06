import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import Handlebars from 'handlebars';
import {
    Plugin,
    PluginExecutionContext,
    ServiceCapabilities,
    ContentResolver,
    OutputConfigSchema,
    zHandlebars
} from 'batchprompt';

const execAsync = promisify(exec);

export const ShellConfigSchema = z.object({
    type: z.literal('shell-command'),
    command: zHandlebars.optional().describe("Shell command to run after generation."),
    verifyCommand: zHandlebars.optional().describe("Shell command to verify the result."),
    skipCandidateCommand: z.boolean().default(false).describe("If true, skips running the post-process command on candidates."),
    output: OutputConfigSchema.default({
        mode: 'ignore',
        explode: false
    })
});

export type ShellConfig = z.infer<typeof ShellConfigSchema>;

export class ShellPlugin implements Plugin<ShellConfig, ShellConfig> {
    readonly type = 'shell-command';
    readonly configSchema = ShellConfigSchema;
    readonly cliOptions = []; // Managed by adapter

    getRequiredCapabilities(): (keyof ServiceCapabilities)[] {
        return [];
    }

    parseCLIOptions(): ShellConfig | null {
        return null; // Managed by adapter
    }

    async resolveConfig(
        rawConfig: ShellConfig,
        row: Record<string, any>,
        inheritedModel: any,
        contentResolver: ContentResolver
    ): Promise<ShellConfig> {
        return rawConfig;
    }

    async postProcessMessages(
        response: any,
        history: any[],
        config: ShellConfig,
        context: PluginExecutionContext
    ): Promise<any> {
        const { row } = context;

        // 1. Verify Command (Runs inside retry loop)
        if (config.verifyCommand) {
            const tempFile = path.join(context.tempDirectory, `verify_${Date.now()}.tmp`);
            await fs.writeFile(tempFile, typeof response === 'string' ? response : JSON.stringify(response));

            try {
                const template = Handlebars.compile(config.verifyCommand, { noEscape: true });
                const cmd = template({
                    ...row,
                    file: tempFile
                });

                await execAsync(cmd);
            } catch (e: any) {
                throw new Error(`Verification failed: ${e.stderr || e.message}`);
            } finally {
                await fs.unlink(tempFile).catch(() => {});
            }
        }

        // 2. Post-Process Command (Runs after successful generation)
        // Note: In the new architecture, postProcessMessages runs inside the retry loop.
        // If we want 'command' to run only on final success, we might need a different hook or check.
        // However, StandardStrategy calls postProcessMessages. If it succeeds, the loop ends.
        // So running 'command' here effectively runs it on success.
        // BUT if a subsequent plugin fails validation, this command would have already run.
        // This might be a side effect we accept, or we need 'onStepFinish'.
        // Given the constraints, running here is the closest equivalent to 'process' handler.

        if (config.command) {
            const tempFile = path.join(context.tempDirectory, `cmd_input_${Date.now()}.tmp`);
            await fs.writeFile(tempFile, typeof response === 'string' ? response : JSON.stringify(response));

            try {
                const template = Handlebars.compile(config.command, { noEscape: true });
                const cmd = template({
                    ...row,
                    file: tempFile
                });

                await execAsync(cmd);
            } finally {
                await fs.unlink(tempFile).catch(() => {});
            }
        }

        return response;
    }
}
