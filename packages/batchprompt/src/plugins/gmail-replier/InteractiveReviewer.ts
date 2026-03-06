import { select } from '@inquirer/prompts';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export class InteractiveReviewer {
    static async review(subject: string, draft: string): Promise<{ action: 'send' | 'ignore' | 'regenerate', text: string }> {
        let currentDraft = draft;

        while (true) {
            console.log(`\n==================================================`);
            console.log(`📧 REPLYING TO: ${subject}`);
            console.log(`==================================================`);
            console.log(currentDraft);
            console.log(`==================================================\n`);

            const answer = await select({
                message: 'What would you like to do with this draft?',
                choices: [
                    {
                        name: 'Send',
                        value: 'send',
                        description: 'Send the email immediately'
                    },
                    {
                        name: 'Edit',
                        value: 'edit',
                        description: 'Open the draft in your default editor ($EDITOR)'
                    },
                    {
                        name: 'Regenerate',
                        value: 'regenerate',
                        description: 'Discard this draft and generate a new one'
                    },
                    {
                        name: 'Ignore',
                        value: 'ignore',
                        description: 'Skip replying to this email'
                    }
                ]
            });

            if (answer === 'send') {
                return { action: 'send', text: currentDraft };
            } else if (answer === 'ignore') {
                return { action: 'ignore', text: currentDraft };
            } else if (answer === 'regenerate') {
                return { action: 'regenerate', text: currentDraft };
            } else if (answer === 'edit') {
                const tmpFile = path.join(os.tmpdir(), `draft-${Date.now()}.txt`);
                fs.writeFileSync(tmpFile, currentDraft, 'utf8');
                
                const editor = process.env.EDITOR || 'nano';
                spawnSync(editor, [tmpFile], { stdio: 'inherit' });
                
                currentDraft = fs.readFileSync(tmpFile, 'utf8');
                fs.unlinkSync(tmpFile);
            }
        }
    }
}
