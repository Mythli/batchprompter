import * as readline from 'readline';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export class InteractiveReviewer {
    static async review(subject: string, draft: string): Promise<{ action: 'send' | 'ignore' | 'regenerate', text: string }> {
        let currentDraft = draft;
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

        const question = (query: string): Promise<string> => new Promise(resolve => rl.question(query, resolve));

        try {
            while (true) {
                console.log(`\n==================================================`);
                console.log(`📧 REPLYING TO: ${subject}`);
                console.log(`==================================================`);
                console.log(currentDraft);
                console.log(`==================================================\n`);

                const answer = (await question(`Action [ (S)end | (E)dit | (R)egenerate | (I)gnore ]: `)).trim().toLowerCase();

                if (answer === 's') {
                    return { action: 'send', text: currentDraft };
                } else if (answer === 'i') {
                    return { action: 'ignore', text: currentDraft };
                } else if (answer === 'r') {
                    return { action: 'regenerate', text: currentDraft };
                } else if (answer === 'e') {
                    const tmpFile = path.join(os.tmpdir(), `draft-${Date.now()}.txt`);
                    fs.writeFileSync(tmpFile, currentDraft, 'utf8');
                    
                    const editor = process.env.EDITOR || 'nano';
                    spawnSync(editor, [tmpFile], { stdio: 'inherit' });
                    
                    currentDraft = fs.readFileSync(tmpFile, 'utf8');
                    fs.unlinkSync(tmpFile);
                } else {
                    console.log("Invalid option. Please choose S, E, R, or I.");
                }
            }
        } finally {
            rl.close();
        }
    }
}
