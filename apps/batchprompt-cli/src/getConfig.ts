import { getConfig as getCoreConfig } from 'batchprompt';
import { FileSystemContentResolver } from './io/FileSystemContentResolver.js';
import { PromptLoader } from './loaders/PromptLoader.js';
import { SchemaLoader } from './loaders/SchemaLoader.js';

export const getConfig = async () => {
    const contentResolver = new FileSystemContentResolver();
    const promptLoader = new PromptLoader(contentResolver);
    const schemaLoader = new SchemaLoader(contentResolver);
    
    return getCoreConfig({ 
        contentResolver,
        promptLoader,
        schemaLoader
    });
};
