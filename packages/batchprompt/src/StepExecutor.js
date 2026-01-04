import path from 'path';
import { StandardStrategy } from './strategies/StandardStrategy.js';
import { CandidateStrategy } from './strategies/CandidateStrategy.js';
export class StepExecutor {
    events;
    messageBuilder;
    constructor(events, messageBuilder) {
        this.events = events;
        this.messageBuilder = messageBuilder;
    }
    async executeModel(stepContext, viewContext, index, stepIndex, config, history, pluginContentParts, variationIndex) {
        let effectiveUserPromptParts = pluginContentParts;
        const hasUserPrompt = config.userPromptParts.length > 0;
        const hasSystemPrompt = config.modelConfig.systemParts.length > 0;
        const hasModelPrompt = config.modelConfig.promptParts.length > 0;
        if (effectiveUserPromptParts.length === 0 && !hasSystemPrompt && !hasModelPrompt) {
            this.events.emit('step:progress', { row: index, step: stepIndex, type: 'info', message: `No prompt and no content. Treating as pass-through.` });
            return {
                historyMessage: { role: 'assistant', content: '' },
                modelResult: {}
            };
        }
        if (!hasUserPrompt && !hasSystemPrompt && !hasModelPrompt && effectiveUserPromptParts.length > 0) {
            this.events.emit('step:progress', { row: index, step: stepIndex, type: 'info', message: `No prompt detected. Saving plugin output directly...` });
            // Emit artifacts for plugin content
            for (let i = 0; i < effectiveUserPromptParts.length; i++) {
                const part = effectiveUserPromptParts[i];
                let ext = '.txt';
                let content = '';
                let type = 'text';
                if (part.type === 'text') {
                    content = part.text;
                }
                else if (part.type === 'image_url') {
                    content = part.image_url.url;
                    type = 'image';
                    ext = '.jpg';
                }
                else if (part.type === 'input_audio') {
                    content = Buffer.from(part.input_audio.data, 'base64');
                    type = 'audio';
                    ext = `.${part.input_audio.format}`;
                }
                let filename = effectiveUserPromptParts.length === 1
                    ? `${config.outputBasename || 'output'}${ext}`
                    : `${config.outputBasename || 'output'}_${i}${ext}`;
                const targetDir = config.resolvedOutputDir || config.resolvedTempDir;
                if (targetDir) {
                    filename = path.join(targetDir, filename);
                }
                this.events.emit('plugin:artifact', {
                    row: index,
                    step: stepIndex,
                    plugin: 'model',
                    type,
                    filename,
                    content,
                    tags: ['plugin-output', 'final']
                });
            }
            return {
                historyMessage: {
                    role: 'assistant',
                    content: `[Saved ${effectiveUserPromptParts.length} items from plugins]`
                },
                modelResult: {}
            };
        }
        let strategy = new StandardStrategy(stepContext.llm, this.messageBuilder, this.events);
        if (config.candidates > 1) {
            strategy = new CandidateStrategy(strategy, stepContext, this.events);
        }
        const result = await strategy.execute(viewContext, index, stepIndex, config, effectiveUserPromptParts, history, undefined, // cacheSalt
        undefined, // outputPathOverride
        false, // skipCommands
        variationIndex // Pass variation index for filename generation
        );
        return {
            historyMessage: result.historyMessage,
            modelResult: result.raw !== undefined ? result.raw : result.columnValue
        };
    }
}
//# sourceMappingURL=StepExecutor.js.map