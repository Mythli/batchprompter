import { z } from 'zod';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import csv from 'csv-parser';
import Handlebars from 'handlebars';
import { BasePlugin, BasePluginRow, PluginResult } from '../types.js';
import { StepRow } from '../../StepRow.js';
import { PartialOutputConfigSchema, StepConfig, GlobalConfig } from '../../config/schema.js';
import { zHandlebars } from '../../config/validationRules.js';

export const LoadDataConfigSchema = z.object({
    type: z.literal('loadData'),
    id: z.string().optional(),
    data: z.array(z.any()).optional().describe("Hardcoded array of data objects to inject."),
    file: zHandlebars.optional().describe("Path to a JSON or CSV file to load."),
    output: PartialOutputConfigSchema.optional()
});

export type LoadDataConfig = z.output<typeof LoadDataConfigSchema>;

function unflatten(obj: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
        const parts = key.split('.');
        let current = result;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!(parts[i] in current) || typeof current[parts[i]] !== 'object' || current[parts[i]] === null) {
                current[parts[i]] = {};
            }
            current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
    }
    return result;
}

export class LoadDataPluginRow extends BasePluginRow<LoadDataConfig> {
    async prepare(): Promise<PluginResult> {
        const { stepRow, config } = this;
        const history = await stepRow.getPreparedMessages();
        let items: any[] = [];

        if (config.data) {
            items = config.data;
        } else if (config.file) {
            const template = Handlebars.compile(config.file, { noEscape: true });
            const filePath = template(stepRow.context);

            if (filePath.toLowerCase().endsWith('.json')) {
                const content = await fs.readFile(filePath, 'utf-8');
                items = JSON.parse(content);
                if (!Array.isArray(items)) items = [items];
            } else if (filePath.toLowerCase().endsWith('.csv')) {
                items = await new Promise((resolve, reject) => {
                    const results: any[] = [];
                    createReadStream(filePath)
                        .pipe(csv())
                        .on('data', (data) => results.push(unflatten(data)))
                        .on('end', () => resolve(results))
                        .on('error', reject);
                });
            } else {
                throw new Error(`Unsupported file type for loadData: ${filePath}. Use .json or .csv`);
            }
        }

        return {
            history,
            items: items.map(data => ({ data, contentParts: [] }))
        };
    }
}

export class LoadDataPlugin extends BasePlugin<LoadDataConfig, LoadDataConfig> {
    readonly type = 'loadData';

    getSchema() {
        return LoadDataConfigSchema;
    }

    createRow(stepRow: StepRow, config: LoadDataConfig): BasePluginRow<LoadDataConfig> {
        return new LoadDataPluginRow(stepRow, config);
    }
}
