import { BasePluginRow, PluginResult } from '../types.js';
import { StepRow } from '../../StepRow.js';
import { WebsiteAgentConfig } from './WebsiteAgentPlugin.js';
import { AiWebsiteAgent } from './AiWebsiteAgent.js';
import { PuppeteerHelper } from '../../utils/puppeteer/PuppeteerHelper.js';
import PQueue from 'p-queue';

export class WebsiteAgentPluginRow extends BasePluginRow<WebsiteAgentConfig> {
    constructor(
        stepRow: StepRow,
        config: WebsiteAgentConfig,
        private puppeteerHelper: PuppeteerHelper,
        private puppeteerQueue: PQueue
    ) {
        super(stepRow, config);
    }

    async prepare(): Promise<PluginResult> {
        const { stepRow, config } = this;
        const { context } = stepRow;
        const emit = stepRow.step.deps.events.emit.bind(stepRow.step.deps.events);

        // Create LLM clients
        const navigatorLlm = await stepRow.createLlm(config.navigatorModel);
        const extractLlm = await stepRow.createLlm(config.extractModel);
        const mergeLlm = await stepRow.createLlm(config.mergeModel);

        const agent = new AiWebsiteAgent(
            navigatorLlm,
            extractLlm,
            mergeLlm,
            this.puppeteerHelper,
            this.puppeteerQueue
        );

        // Bridge events
        agent.events.on('page:scraped', (data) => {
            emit('plugin:event', {
                row: context.index,
                step: stepRow.step.stepIndex,
                plugin: 'website-agent',
                event: 'page:scraped',
                data
            });
        });

        agent.events.on('decision:made', (data) => {
            emit('plugin:event', {
                row: context.index,
                step: stepRow.step.stepIndex,
                plugin: 'website-agent',
                event: 'decision:made',
                data
            });
        });

        agent.events.on('results:merged', (data) => {
            emit('plugin:event', {
                row: context.index,
                step: stepRow.step.stepIndex,
                plugin: 'website-agent',
                event: 'results:merged',
                data
            });
        });

        agent.events.on('start', (data) => {
            emit('plugin:event', {
                row: context.index,
                step: stepRow.step.stepIndex,
                plugin: 'website-agent',
                event: 'start',
                data
            });
        });

        agent.events.on('stop', (data) => {
            emit('plugin:event', {
                row: context.index,
                step: stepRow.step.stepIndex,
                plugin: 'website-agent',
                event: 'stop',
                data
            });
        });

        agent.events.on('batch', (data) => {
            emit('plugin:event', {
                row: context.index,
                step: stepRow.step.stepIndex,
                plugin: 'website-agent',
                event: 'batch',
                data
            });
        });

        agent.events.on('error', (data) => {
            emit('plugin:event', {
                row: context.index,
                step: stepRow.step.stepIndex,
                plugin: 'website-agent',
                event: 'error',
                data
            });
        });

        // Execute Agent
        const result = await agent.scrapeIterative(
            config.url,
            config.schema,
            config.schema, // Use same schema for merge for now, or could be separate
            {
                budget: config.budget,
                batchSize: config.batchSize,
                row: context
            }
        );

        const history = await stepRow.getPreparedMessages();

        return {
            history,
            items: [{ data: result, contentParts: [] }]
        };
    }
}
