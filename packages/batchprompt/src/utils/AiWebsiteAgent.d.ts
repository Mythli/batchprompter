import PQueue from 'p-queue';
import { EventEmitter } from 'eventemitter3';
import { BoundLlmClient } from '../src/core/BoundLlmClient.js';
import { PuppeteerHelper } from './puppeteer/PuppeteerHelper.js';
export interface AiWebsiteAgentOptions {
    budget: number;
    batchSize: number;
    row: Record<string, any>;
}
export declare class AiWebsiteAgent {
    private navigatorLlm;
    private extractLlm;
    private mergeLlm;
    private puppeteerHelper;
    private puppeteerQueue;
    readonly events: EventEmitter<string | symbol, any>;
    constructor(navigatorLlm: BoundLlmClient, extractLlm: BoundLlmClient, mergeLlm: BoundLlmClient, puppeteerHelper: PuppeteerHelper, puppeteerQueue: PQueue);
    private getPageContent;
    private extractDataFromMarkdown;
    private decideNextSteps;
    private mergeResults;
    scrapeIterative(initialUrl: string, extractionSchema: any, mergeSchema: any, options: AiWebsiteAgentOptions): Promise<any>;
}
//# sourceMappingURL=AiWebsiteAgent.d.ts.map