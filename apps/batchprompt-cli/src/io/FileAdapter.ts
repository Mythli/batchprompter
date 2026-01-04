import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import { PipelineConfig } from 'batchprompt';

export class FileAdapter {
    /**
     * Load config from a file path or raw JSON/YAML string
     */
    async load(filePathOrContent: string): Promise<any> {
        let content: string;

        // Check if input looks like a JSON object (starts with {) or has newlines (likely raw YAML/JSON)
        if (filePathOrContent.trim().startsWith('{') || filePathOrContent.includes('\n')) {
            content = filePathOrContent;
        } else {
            // Treat as file path
            if (!fs.existsSync(filePathOrContent)) {
                throw new Error(`Config file not found: ${filePathOrContent}`);
            }
            content = fs.readFileSync(filePathOrContent, 'utf-8');
        }

        // Try parsing as JSON first
        try {
            return JSON.parse(content);
        } catch (e) {
            // If JSON fails, try YAML
            try {
                return yaml.load(content);
            } catch (e2) {
                throw new Error('Failed to parse configuration. Ensure it is valid JSON or YAML.');
            }
        }
    }
}
