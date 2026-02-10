import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import Handlebars from 'handlebars';
import {
    BasePlugin,
    BasePluginRow,
    PluginResult,
    PartialOutputConfigSchema,
    zHandlebars
} from 'batchprompt';
import type { StepRow } from 'batchprompt';
import type { StepConfig, GlobalConfig } from 'batchprompt';

const execAsync = promisify(exec);

export const ShellConfigSchema = z.object({
    type: z.literal('shell-command'),
    id: z.string().optional(),
    output: PartialOutputConfigSchema.optional(),
    command: zHandlebars.optional().describe("Shell command to run after generation."),
    verifyCommand: zHandlebars.optional().describe("Shell command to verify the result."),
    skipCandidateCommand: z.boolean().default(false).describe("If true, skips running the post-process command on candidates."),
});

export type ShellConfig = z.output<typeof ShellConfigSchema>;

class ShellPluginRow extends BasePluginRow<ShellConfig> {
    constructor(stepRow: StepRow, config: ShellConfig) {
        super(stepRow, config);
    }

    async postProcess(response: any): Promise<PluginResult> {
        const { stepRow, config } = this;
        const row = stepRow.context;
        const tempDir = await stepRow.getTempDir();
        const history = await stepRow.getPreparedMessages();

        // 1. Verify Command (Runs inside retry loop)
        if (config.verifyCommand) {
            const tempFile = path.join(tempDir, `verify_${Date.now()}.tmp`);
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

        // 2. Post-Process Command
        if (config.command) {
            const tempFile = path.join(tempDir, `cmd_input_${Date.now()}.tmp`);
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

        return {
            history,
            items: [{ data: response, contentParts: [] }]
        };
    }
}

export class ShellPlugin extends BasePlugin<ShellConfig, ShellConfig> {
    readonly type = 'shell-command';

    getSchema() {
        return ShellConfigSchema;
    }

    normalizeConfig(config: ShellConfig, stepConfig: StepConfig, globalConfig: GlobalConfig): ShellConfig {
        const base = super.normalizeConfig(config, stepConfig, globalConfig);
        return {
            ...base,
            id: config.id ?? `shell-command-${Date.now()}`,
        };
    }

    createRow(stepRow: StepRow, config: ShellConfig): BasePluginRow<ShellConfig> {
        return new ShellPluginRow(stepRow, config);
    }
}
