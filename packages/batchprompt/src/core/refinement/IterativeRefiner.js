export class IterativeRefiner {
    options;
    constructor(options) {
        this.options = options;
    }
    async run(input) {
        const history = [];
        let currentConfig;
        let lastOutput;
        for (let i = 0; i < this.options.maxRetries; i++) {
            console.log(`[IterativeRefiner] Iteration ${i + 1}/${this.options.maxRetries}`);
            // 1. Generate
            try {
                currentConfig = await this.generate(input, history);
            }
            catch (e) {
                console.error(`[IterativeRefiner] Generation failed: ${e.message}`);
                // If generation fails, we record it and try again
                history.push({
                    error: e.message,
                    feedback: `Previous generation failed with error: ${e.message}. Please fix the configuration structure.`
                });
                continue;
            }
            // 2. Execute
            try {
                lastOutput = await this.execute(currentConfig, input);
            }
            catch (e) {
                console.error(`[IterativeRefiner] Execution failed: ${e.message}`);
                // Execution errors are valid feedback for the LLM
                history.push({
                    config: currentConfig,
                    error: e.message,
                    feedback: `The configuration caused an execution error: ${e.message}. Please fix the configuration to avoid this error.`
                });
                continue;
            }
            // 3. Evaluate
            const evaluation = await this.evaluate(input, currentConfig, lastOutput);
            if (evaluation.success) {
                console.log(`[IterativeRefiner] Success on iteration ${i + 1}`);
                return { config: currentConfig, output: lastOutput, iterations: i + 1 };
            }
            console.log(`[IterativeRefiner] Feedback: ${evaluation.feedback}`);
            history.push({
                config: currentConfig,
                feedback: evaluation.feedback
            });
        }
        if (!currentConfig) {
            throw new Error("Failed to generate any valid configuration.");
        }
        console.warn(`[IterativeRefiner] Max retries reached. Returning last result.`);
        return { config: currentConfig, output: lastOutput, iterations: this.options.maxRetries };
    }
}
//# sourceMappingURL=IterativeRefiner.js.map