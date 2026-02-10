import { initConfig, BatchPromptDeps } from 'batchprompt';
import { FileSystemContentResolver } from './io/FileSystemContentResolver.js';
import { ContentResolver } from 'batchprompt';

export interface CliDeps extends BatchPromptDeps {
    contentResolver: ContentResolver;
}

export const getDiContainer = async (): Promise<CliDeps> => {
    const deps = await initConfig(process.env);
    const contentResolver = new FileSystemContentResolver();

    return {
        ...deps,
        contentResolver
    };
};
