// 
import { Command } from 'commander';
import 'dotenv/config';
import fsPromises from 'fs/promises';
import { StepRegistry } from './cli/StepRegistry.js';
import { createDefaultRegistry, getConfig } from './getConfig.js';
import { ServiceCapabilities } from './types.js';
import { FileAdapter } from './adapters/FileAdapter.js';

const program = new Command();

program
    .name('batchprompt')
    .description('Generate images and text from CSV or JSON data using AI');

const generateCmd = program.command('generate')
    .description('Generate content (text and/or images) from data file')
    .argument('[data-file]', 'Path to the CSV or JSON file')
    .argument('[template-files...]', 'Path to the prompt template files (text, image, audio, or directory)');

// Create a registry for CLI configuration purposes only
// At this point we don't know actual capabilities, so we assume all are available
// Actual validation happens during normalize() when real capabilities are known
const cliCapabilities: ServiceCapabilities = {
    hasSerper: true,  // Assume available for CLI registration
    hasPuppeteer: true
};
const cliRegistry = createDefaultRegistry(cliCapabilities);

// Register all step arguments
StepRegistry.registerStepArgs(generateCmd, cliRegistry);

generateCmd.action(async (dataFilePath, templateFilePaths, options) => {
    let puppeteerHelperInstance;
    try {
        // Get the runner from DI first to get actual capabilities
        const { actionRunner, puppeteerHelper, config: resolvedConfig, capabilities, pluginRegistry } = await getConfig();
        puppeteerHelperInstance = puppeteerHelper;

        let config;

        // Check if we're using a config file
        if (options.config) {
            const fileAdapter = new FileAdapter();
            const yamlConfig = await fileAdapter.load(options.config);
            
            // Transform YAML config to CLI options format
            const transformed = transformYamlToCli(yamlConfig);
            
            // Merge CLI overrides (CLI takes precedence over config file)
            const mergedOptions = { ...transformed.options, ...options };
            
            config = await StepRegistry.parseConfig(mergedOptions, transformed.args, pluginRegistry);
        } else {
            // Original CLI-only flow
            if (!dataFilePath) {
                throw new Error('Data file path is required when not using --config');
            }
            config = await StepRegistry.parseConfig(options, [dataFilePath, ...templateFilePaths], pluginRegistry);
        }

        // Update the runtime config with the resolved concurrency values if they weren't in CLI args
        // This ensures ActionRunner uses the correct values (Env > Default) if CLI didn't specify them
        const finalConfig = {
            ...config,
            concurrency: config.concurrency ?? resolvedConfig.GPT_CONCURRENCY,
            taskConcurrency: config.taskConcurrency ?? resolvedConfig.TASK_CONCURRENCY
        };

        // Run
        await actionRunner.run(finalConfig);
        
        // Cleanup
        if (puppeteerHelperInstance) {
            await puppeteerHelperInstance.close();
        }
        process.exit(0);
    } catch (e: any) {
        console.error("\n❌ Error:", e.message || e);
        console.log("\n--- Usage Help ---\n");
        generateCmd.outputHelp();
        
        // Cleanup on error
        if (puppeteerHelperInstance) {
            await puppeteerHelperInstance.close();
        }
        process.exit(1);
    }
});

/**
 * Transform a YAML config object into CLI options format
 */
function transformYamlToCli(yamlConfig: any): { options: Record<string, any>, args: string[] } {
    const options: Record<string, any> = {};
    const args: string[] = [];
    
    // Data source is the first positional arg
    if (yamlConfig.data?.source) {
        args.push(yamlConfig.data.source);
    }
    
    // Data options
    if (yamlConfig.data?.offset !== undefined) options.offset = yamlConfig.data.offset;
    if (yamlConfig.data?.limit !== undefined) options.limit = yamlConfig.data.limit;
    
    // Global options
    if (yamlConfig.globals) {
        const g = yamlConfig.globals;
        if (g.model) options.model = g.model;
        if (g.temperature !== undefined) options.temperature = g.temperature;
        if (g.thinkingLevel) options.thinkingLevel = g.thinkingLevel;
        if (g.concurrency !== undefined) options.concurrency = g.concurrency;
        if (g.taskConcurrency !== undefined) options.taskConcurrency = g.taskConcurrency;
        if (g.tmpDir) options.tmpDir = g.tmpDir;
        if (g.outputPath) options.dataOutput = g.outputPath;
    }
    
    // Steps
    if (yamlConfig.steps && Array.isArray(yamlConfig.steps)) {
        yamlConfig.steps.forEach((step: any, stepIdx: number) => {
            const stepNum = stepIdx + 1;
            
            // Step-level prompt becomes positional arg
            if (step.prompt) {
                while (args.length < stepNum) args.push('');
                args[stepNum] = typeof step.prompt === 'string' ? step.prompt : '';
            }
            
            // Step-level system prompt
            if (step.system) {
                const key = stepNum === 1 ? 'system' : `system${stepNum}`;
                options[key] = typeof step.system === 'string' ? step.system : '';
            }
            
            // Step model options
            if (step.model) {
                if (step.model.model) options[`model${stepNum}`] = step.model.model;
                if (step.model.temperature !== undefined) options[`temperature${stepNum}`] = step.model.temperature;
                if (step.model.thinkingLevel) options[`thinkingLevel${stepNum}`] = step.model.thinkingLevel;
            }
            
            // Step output options
            if (step.output) {
                if (step.output.mode === 'merge') options[`export${stepNum}`] = true;
                if (step.output.mode === 'column' && step.output.column) {
                    options[`outputColumn${stepNum}`] = step.output.column;
                }
                if (step.output.explode) options[`explode${stepNum}`] = true;
            }
            
            // Step schema
            if (step.schema) {
                options[`jsonSchema${stepNum}`] = typeof step.schema === 'string' ? step.schema : JSON.stringify(step.schema);
            }
            
            // Step commands
            if (step.command) options[`command${stepNum}`] = step.command;
            if (step.verifyCommand) options[`verifyCommand${stepNum}`] = step.verifyCommand;
            
            // Step candidates
            if (step.candidates !== undefined) options[`candidates${stepNum}`] = step.candidates;
            if (step.skipCandidateCommand) options[`skipCandidateCommand${stepNum}`] = true;
            
            // Step aspect ratio
            if (step.aspectRatio) options[`aspectRatio${stepNum}`] = step.aspectRatio;
            
            // Plugins
            if (step.plugins && Array.isArray(step.plugins)) {
                for (const plugin of step.plugins) {
                    transformPluginToCli(plugin, stepNum, options);
                }
            }
            
            // Preprocessors (if specified separately from plugins)
            if (step.preprocessors && Array.isArray(step.preprocessors)) {
                for (const preprocessor of step.preprocessors) {
                    transformPreprocessorToCli(preprocessor, stepNum, options);
                }
            }
        });
    }
    
    return { options, args };
}

/**
 * Transform a plugin config to CLI options
 */
function transformPluginToCli(plugin: any, stepNum: number, options: Record<string, any>) {
    const type = plugin.type;
    
    if (type === 'web-search') {
        if (plugin.query) options[`webSearchQuery${stepNum}`] = plugin.query;
        if (plugin.queryPrompt) options[`webQueryPrompt${stepNum}`] = plugin.queryPrompt;
        if (plugin.selectPrompt) options[`webSelectPrompt${stepNum}`] = plugin.selectPrompt;
        if (plugin.compressPrompt) options[`webCompressPrompt${stepNum}`] = plugin.compressPrompt;
        if (plugin.limit !== undefined) options[`webSearchLimit${stepNum}`] = plugin.limit;
        if (plugin.mode) options[`webSearchMode${stepNum}`] = plugin.mode;
        if (plugin.queryCount !== undefined) options[`webSearchQueryCount${stepNum}`] = plugin.queryCount;
        if (plugin.maxPages !== undefined) options[`webSearchMaxPages${stepNum}`] = plugin.maxPages;
        if (plugin.dedupeStrategy) options[`webSearchDedupeStrategy${stepNum}`] = plugin.dedupeStrategy;
        if (plugin.gl) options[`webSearchGl${stepNum}`] = plugin.gl;
        if (plugin.hl) options[`webSearchHl${stepNum}`] = plugin.hl;
        
        // Output config
        if (plugin.output) {
            if (plugin.output.mode === 'merge') options[`webSearchExport${stepNum}`] = true;
            if (plugin.output.mode === 'column') options[`webSearchOutput${stepNum}`] = plugin.output.column;
            if (plugin.output.explode) options[`webSearchExplode${stepNum}`] = true;
        }
    } else if (type === 'image-search') {
        if (plugin.query) options[`imageSearchQuery${stepNum}`] = plugin.query;
        if (plugin.queryPrompt) options[`imageQueryPrompt${stepNum}`] = plugin.queryPrompt;
        if (plugin.selectPrompt) options[`imageSelectPrompt${stepNum}`] = plugin.selectPrompt;
        if (plugin.limit !== undefined) options[`imageSearchLimit${stepNum}`] = plugin.limit;
        if (plugin.select !== undefined) options[`imageSearchSelect${stepNum}`] = plugin.select;
        if (plugin.queryCount !== undefined) options[`imageSearchQueryCount${stepNum}`] = plugin.queryCount;
        if (plugin.spriteSize !== undefined) options[`imageSearchSpriteSize${stepNum}`] = plugin.spriteSize;
        if (plugin.maxPages !== undefined) options[`imageSearchMaxPages${stepNum}`] = plugin.maxPages;
        if (plugin.dedupeStrategy) options[`imageSearchDedupeStrategy${stepNum}`] = plugin.dedupeStrategy;
        if (plugin.gl) options[`imageSearchGl${stepNum}`] = plugin.gl;
        if (plugin.hl) options[`imageSearchHl${stepNum}`] = plugin.hl;
        
        if (plugin.output) {
            if (plugin.output.mode === 'merge') options[`imageSearchExport${stepNum}`] = true;
            if (plugin.output.mode === 'column') options[`imageSearchOutput${stepNum}`] = plugin.output.column;
            if (plugin.output.explode) options[`imageSearchExplode${stepNum}`] = true;
        }
    } else if (type === 'website-agent') {
        if (plugin.url) options[`websiteAgentUrl${stepNum}`] = plugin.url;
        if (plugin.schema) {
            options[`websiteAgentSchema${stepNum}`] = typeof plugin.schema === 'string' 
                ? plugin.schema 
                : JSON.stringify(plugin.schema);
        }
        if (plugin.budget !== undefined) options[`websiteAgentBudget${stepNum}`] = plugin.budget;
        if (plugin.batchSize !== undefined) options[`websiteAgentBatchSize${stepNum}`] = plugin.batchSize;
        if (plugin.navigatorPrompt) options[`websiteNavigatorPrompt${stepNum}`] = plugin.navigatorPrompt;
        if (plugin.extractPrompt) options[`websiteExtractPrompt${stepNum}`] = plugin.extractPrompt;
        if (plugin.mergePrompt) options[`websiteMergePrompt${stepNum}`] = plugin.mergePrompt;
        
        if (plugin.output) {
            if (plugin.output.mode === 'merge') options[`websiteAgentExport${stepNum}`] = true;
            if (plugin.output.mode === 'column') options[`websiteAgentOutput${stepNum}`] = plugin.output.column;
        }
    } else if (type === 'style-scraper') {
        if (plugin.url) options[`styleScrapeUrl${stepNum}`] = plugin.url;
        if (plugin.resolution) options[`styleScrapeResolution${stepNum}`] = plugin.resolution;
        if (plugin.mobile) options[`styleScrapeMobile${stepNum}`] = true;
        if (plugin.interactive) options[`styleScrapeInteractive${stepNum}`] = true;
        
        if (plugin.output) {
            if (plugin.output.mode === 'merge') options[`styleScraperExport${stepNum}`] = true;
            if (plugin.output.mode === 'column') options[`styleScraperOutput${stepNum}`] = plugin.output.column;
        }
    } else if (type === 'validation') {
        if (plugin.schema) {
            options[`validateSchema${stepNum}`] = typeof plugin.schema === 'string' 
                ? plugin.schema 
                : JSON.stringify(plugin.schema);
        }
        if (plugin.target) options[`validateTarget${stepNum}`] = plugin.target;
    } else if (type === 'dedupe') {
        if (plugin.key) options[`dedupeKey${stepNum}`] = plugin.key;
    } else if (type === 'url-expander') {
        // URL expander is technically a preprocessor but can be specified in plugins array for convenience
        transformPreprocessorToCli(plugin, stepNum, options);
    }
}

/**
 * Transform a preprocessor config to CLI options
 */
function transformPreprocessorToCli(preprocessor: any, stepNum: number, options: Record<string, any>) {
    const type = preprocessor.type;
    
    if (type === 'url-expander') {
        // Enable URL expansion for this step
        options[`expandUrls${stepNum}`] = true;
        
        // Mode defaults to 'puppeteer' if not specified
        if (preprocessor.mode) {
            options[`expandUrlsMode${stepNum}`] = preprocessor.mode;
        }
        // Note: If mode is not specified, the preprocessor will use its default ('puppeteer')
        
        if (preprocessor.maxChars !== undefined) {
            options[`expandUrlsMaxChars${stepNum}`] = preprocessor.maxChars;
        }
    }
}

program.parse();
