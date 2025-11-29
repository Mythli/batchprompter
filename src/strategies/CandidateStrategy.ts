import OpenAI from 'openai';
import path from 'path';
import Handlebars from 'handlebars';
import util from 'util';
import { exec } from 'child_process';
import { GenerationStrategy, GenerationResult } from './GenerationStrategy.js';
import { StandardStrategy } from './StandardStrategy.js';
import { ResolvedStepConfig } from '../StepConfigurator.js';
import { AskGptFunction } from '../createCachedGptAsk.js';
import { aggressiveSanitize, ensureDir } from '../utils/fileUtils.js';

const execPromise = util.promisify(exec);

export class CandidateStrategy implements GenerationStrategy {
    constructor(
        private standardStrategy: StandardStrategy,
        private ask: AskGptFunction
    ) {}

    async execute(
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        config: ResolvedStepConfig,
        userPromptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        cacheSalt?: string | number,
        outputPathOverride?: string,
        skipCommands?: boolean
    ): Promise<GenerationResult> {
        const candidateCount = config.candidates;
        console.log(`[Row ${index}] Step ${stepIndex} Generating ${candidateCount} candidates...`);

        const promises: Promise<GenerationResult & { candidateIndex: number, outputPath: string | null }>[] = [];

        for (let i = 0; i < candidateCount; i++) {
            // Determine a unique output path for this candidate
            let candidateOutputPath: string | null = null;

            if (config.candidateOutputTemplate) {
                // Use the custom template if provided
                const delegate = Handlebars.compile(config.candidateOutputTemplate, { noEscape: true });
                const sanitizedRow: Record<string, string> = {};
                for (const [key, val] of Object.entries(row)) {
                    const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
                    const sanitized = aggressiveSanitize(stringVal);
                    sanitizedRow[key] = sanitized;
                }
                // Add candidate index to the context
                sanitizedRow['candidate_index'] = (i + 1).toString();
                candidateOutputPath = delegate(sanitizedRow);

            } else if (config.outputPath) {
                // Default behavior: append _cand_N
                const ext = path.extname(config.outputPath);
                const base = path.basename(config.outputPath, ext);
                const dir = path.dirname(config.outputPath);
                candidateOutputPath = path.join(dir, `${base}_cand_${i + 1}${ext}`);
            }

            // We use the loop index as the cacheSalt to ensure unique generations
            const salt = `${cacheSalt || ''}_cand_${i}`;

            // If noCandidateCommand is true, we skip commands during candidate generation
            const shouldSkipCommands = config.noCandidateCommand || skipCommands;

            promises.push(
                this.standardStrategy.execute(
                    row, index, stepIndex, config, userPromptParts, history, salt, candidateOutputPath || undefined, shouldSkipCommands
                ).then(res => ({ ...res, candidateIndex: i, outputPath: candidateOutputPath }))
            );
        }

        const results = await Promise.allSettled(promises);
        const successfulCandidates = results
            .filter(r => r.status === 'fulfilled')
            .map(r => (r as PromiseFulfilledResult<GenerationResult & { candidateIndex: number, outputPath: string | null }>).value);

        if (successfulCandidates.length === 0) {
            throw new Error(`All ${candidateCount} candidates failed to generate.`);
        }

        let winner = successfulCandidates[0];

        // If we have a judge and more than one candidate, run the judge
        if (config.judgeModel && successfulCandidates.length > 1) {
            console.log(`[Row ${index}] Step ${stepIndex} Judging ${successfulCandidates.length} candidates with ${config.judgeModel}...`);
            try {
                winner = await this.judgeCandidates(successfulCandidates, config, userPromptParts);
                console.log(`[Row ${index}] Step ${stepIndex} Judge selected candidate #${winner.candidateIndex + 1}`);
            } catch (e: any) {
                console.error(`[Row ${index}] Step ${stepIndex} Judging failed, falling back to first candidate. Error: ${e.message}`);
            }
        }

        // If the winner has an output path (it was saved to _cand_N), we should copy it to the final output path
        if (config.outputPath && winner.outputPath) {
            const fs = await import('fs/promises');
            try {
                await ensureDir(config.outputPath);
                await fs.copyFile(winner.outputPath, config.outputPath);
                console.log(`[Row ${index}] Step ${stepIndex} Winner (Candidate ${winner.candidateIndex + 1}) copied to ${config.outputPath}`);
                
                // If commands were skipped during candidate generation, we MUST run them now on the final file
                if (config.noCandidateCommand && config.postProcessCommand) {
                    const cmdTemplate = Handlebars.compile(config.postProcessCommand, { noEscape: true });
                    const cmd = cmdTemplate({ ...row, file: config.outputPath });
                    
                    console.log(`[Row ${index}] Step ${stepIndex} ⚙️ Running deferred command on winner: ${cmd}`);
                    
                    try {
                        const { stdout, stderr } = await execPromise(cmd);
                        if (stdout && stdout.trim()) console.log(`[Row ${index}] Step ${stepIndex} STDOUT:\n${stdout.trim()}`);
                    } catch (error: any) {
                        console.error(`[Row ${index}] Step ${stepIndex} Deferred command failed:`, error.message);
                    }
                }

            } catch (e) {
                console.error(`[Row ${index}] Step ${stepIndex} Failed to copy winner file to final output:`, e);
            }
        }

        return {
            historyMessage: winner.historyMessage,
            columnValue: winner.columnValue
        };
    }

    private async judgeCandidates(
        candidates: (GenerationResult & { candidateIndex: number })[],
        config: ResolvedStepConfig,
        userPromptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[]
    ): Promise<GenerationResult & { candidateIndex: number }> {
        
        const judgeSystemPrompt = "You are an impartial judge evaluating AI responses. You must select the best response based on the user's original request. Return ONLY the JSON object with the index of the best candidate, like {\"best_candidate_index\": 0}.";
        
        const userPromptText = userPromptParts
            .filter(p => p.type === 'text')
            .map(p => p.text)
            .join('\n');

        const judgeMessageContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
            { type: 'text', text: `Original User Request:\n${userPromptText}\n\nCandidates:\n` }
        ];

        for (let i = 0; i < candidates.length; i++) {
            const cand = candidates[i];
            judgeMessageContent.push({ type: 'text', text: `\n--- Candidate ${i} ---\n` });
            
            // Check if candidate content is image URL or text
            const val = cand.columnValue;
            if (val && (val.startsWith('http') || val.startsWith('data:image'))) {
                judgeMessageContent.push({ 
                    type: 'image_url', 
                    image_url: { url: val } 
                });
            } else {
                judgeMessageContent.push({ type: 'text', text: val || "(No Content)" });
            }
        }

        // Add the custom judge prompt parts (rendered)
        if (config.judgePromptParts && config.judgePromptParts.length > 0) {
            judgeMessageContent.push({ type: 'text', text: '\n\n' });
            judgeMessageContent.push(...config.judgePromptParts);
        } else {
            // Default prompt if none provided
            judgeMessageContent.push({ type: 'text', text: "\n\nAnalyze the candidates above and select the best one based on the original request." });
        }

        const response = await this.ask({
            model: config.judgeModel!,
            messages: [
                { role: 'system', content: judgeSystemPrompt },
                { role: 'user', content: judgeMessageContent }
            ],
            response_format: { type: 'json_object' }
        });

        const content = response.choices[0].message.content;
        if (!content) throw new Error("Judge returned empty response");

        const parsed = JSON.parse(content);
        const index = parsed.best_candidate_index;

        if (typeof index !== 'number' || index < 0 || index >= candidates.length) {
            throw new Error(`Judge returned invalid index: ${index}`);
        }

        return candidates[index];
    }
}
