import { getDiContainer as getCoreConfig, PromptLoader } from 'batchprompt';
import { FileSystemContentResolver } from './io/FileSystemContentResolver.js';
import { SchemaLoader } from './loaders/SchemaLoader.js';

export const getDiContainer = async () => {
    const contentResolver = new FileSystemContentResolver();
    const promptLoader = new PromptLoader(contentResolver);
    const schemaLoader = new SchemaLoader(contentResolver);

    return getCoreConfig({
        contentResolver,
        promptLoader,
        schemaLoader
    });
};
