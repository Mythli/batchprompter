import { PipelineConfig } from '../config/types.js';
/**
 * Loads pipeline configuration from YAML or JSON files
 */
export declare class FileAdapter {
    /**
     * Load config from a file path or raw JSON string
     */
    load(filePathOrContent: string): Promise<PipelineConfig>;
    /**
     * Check if path looks like a config file
     */
    isConfigFile(filePath: string): boolean;
}
//# sourceMappingURL=FileAdapter.d.ts.map