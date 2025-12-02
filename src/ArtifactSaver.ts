// 
import fsPromises from 'fs/promises';
import { ensureDir } from './utils/fileUtils.js';

export class ArtifactSaver {
    static async save(content: string | Buffer, targetPath: string): Promise<void> {
        await ensureDir(targetPath);
        
        if (Buffer.isBuffer(content)) {
            await fsPromises.writeFile(targetPath, content);
            return;
        }

        // Check if content is a URL or Data URI
        if (content.startsWith('http') || content.startsWith('data:image')) {
            let buffer: Buffer;
            if (content.startsWith('http')) {
                const imgRes = await fetch(content);
                const arrayBuffer = await imgRes.arrayBuffer();
                buffer = Buffer.from(arrayBuffer);
            } else {
                // data:image/png;base64,....
                const base64Data = content.replace(/^data:image\/\w+;base64,/, "");
                buffer = Buffer.from(base64Data, 'base64');
            }
            await fsPromises.writeFile(targetPath, buffer);
        } else {
            // Plain text
            await fsPromises.writeFile(targetPath, content);
        }
    }
}
