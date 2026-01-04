import { getConfig as getCoreConfig } from 'batchprompt';
import { FileSystemContentResolver } from './io/FileSystemContentResolver.js';

export const getConfig = async () => {
    const contentResolver = new FileSystemContentResolver();
    return getCoreConfig({ contentResolver });
};
