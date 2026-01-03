import fsPromises from 'fs/promises';
import path from 'path';
import YAML from 'yaml';
import { PipelineConfig } from '../config/types.js';

/**
 * Loads pipeline configuration from YAML or JSON files
 */
export class FileAdapter {
    /**
     * Load config from a file path or raw JSON string
     */
    async load(filePathOrContent: string): Promise<PipelineConfig> {
        let content: string;
        let ext = '';

        // Check if input looks like a JSON object (starts with {)
        if (filePathOrContent.trim().startsWith('{')) {
            content = filePathOrContent;
            // Treat as JSON
            return JSON.parse(content);
        } else {
            content = await fsPromises.readFile(filePathOrContent, 'utf-8');
            ext = path.extname(filePathOrContent).toLowerCase();
        }

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
