import { select, input } from '@inquirer/prompts';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export class InteractiveReviewer {
    static async review(subject: string, targetContext: string, draft: string): Promise<{ action: 'send' | 'ignore' | 'regenerate' | 'change_ai' | 'quit', text: string, instruction?: string }> {
        let currentDraft = draft;

        while (true) {
            console.log(`\n==================================================`);
            console.log(`📧 REPLYING TO: ${subject}`);
            console.log(`==================================================`);
            console.log(`\n--- ORIGINAL THREAD ---`);
            console.log(targetContext.trim());
            console.log(`\n--- DRAFT REPLY ---`);
            console.log(currentDraft.trim());
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
                        name: 'Change with AI',
                        value: 'change_ai',
                        description: 'Provide instructions to rewrite the draft'
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
                    },
                    {
                        name: 'Quit',
                        value: 'quit',
                        description: 'Stop processing and exit'
                    }
                ]
            });

            if (answer === 'send') {
                return { action: 'send', text: currentDraft };
            } else if (answer === 'ignore') {
                return { action: 'ignore', text: currentDraft };
            } else if (answer === 'regenerate') {
                return { action: 'regenerate', text: currentDraft };
            } else if (answer === 'quit') {
                return { action: 'quit', text: currentDraft };
            } else if (answer === 'change_ai') {
                const instruction = await input({ message: 'How should the AI change the draft?' });
                return { action: 'change_ai', text: currentDraft, instruction };
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
