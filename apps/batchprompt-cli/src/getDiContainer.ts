import { initConfig, BatchPromptDeps } from 'batchprompt';
import { FileSystemContentResolver } from './io/FileSystemContentResolver.js';
import { ContentResolver } from 'batchprompt';
import { ShellPlugin } from './plugins/ShellPlugin.js';
import { FileSystemArtifactHandler } from './handlers/FileSystemArtifactHandler.js';
import * as path from 'path';

export interface CliDeps extends BatchPromptDeps {
    contentResolver: ContentResolver;
    artifactHandler: FileSystemArtifactHandler;
}

let cliDepsInstance: CliDeps | null = null;

export const getDiContainer = async (): Promise<CliDeps> => {
    if (cliDepsInstance) {
        return cliDepsInstance;
    }

    const deps = await initConfig(process.env);
    const contentResolver = new FileSystemContentResolver();

    // Register CLI-specific plugins
    deps.pluginRegistry.registerFactory('shell-command', () => new ShellPlugin());

    // Setup CLI-specific event handlers
    const artifactHandler = new FileSystemArtifactHandler(deps.events, path.join(process.cwd(), '.tmp'));

    cliDepsInstance = {
        ...deps,
        contentResolver,
        artifactHandler
    };

    return cliDepsInstance;
};
