import fsPromises from 'fs/promises';
import path from 'path';
import YAML from 'yaml';
import { PipelineConfig } from '../config/types.js';

/**
 * Loads pipeline configuration from YAML or JSON files
 */
export class FileAdapter {
    /**
     * Load config from a file path
     */
    async load(filePath: string): Promise<PipelineConfig> {
        const content = await fsPromises.readFile(filePath, 'utf-8');
        const ext = path.extname(filePath).toLowerCase();

        if (ext === '.yaml' || ext === '.yml') {
            return YAML.parse(content);
        }

        if (ext === '.json') {
            return JSON.parse(content);
        }

        // Try JSON first, then YAML
        try {
            return JSON.parse(content);
        } catch {
            return YAML.parse(content);
        }
    }

    /**
     * Check if path looks like a config file
     */
    isConfigFile(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();
        return ['.yaml', '.yml', '.json'].includes(ext);
    }
}
