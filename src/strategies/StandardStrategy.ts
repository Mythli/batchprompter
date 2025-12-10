import OpenAI from 'openai';
import Handlebars from 'handlebars';
import path from 'path';
import util from 'util';
import { exec } from 'child_process';
import { z } from 'zod';
import fsPromises from 'fs/promises';
import { LlmClient } from 'llm-fns';

import { GenerationStrategy, GenerationResult } from './GenerationStrategy.js';
import { ArtifactSaver } from '../ArtifactSaver.js';
import { StepConfig } from '../types.js';
import { aggressiveSanitize, ensureDir } from '../utils/fileUtils.js';
import { MessageBuilder } from '../core/MessageBuilder.js';

const execPromise = util.promisify(exec);

const responseSchema = z.object({
    choices: z.array(z.object({
        message: z.object({
            content: z.string().nullable().optional(),
            images: z.array(z.object({
                image_url: z.object({
                    url: z.string()
                })
            })).optional(),
            audio: z.object({
                id: z.string(),
                data: z.string(),
                expires_at: z.number(),
                transcript: z.string().optional()
            }).optional()
        })
    })).min(1)
});

type ExtractedContent = {
    type: 'text' | 'image' | 'audio';
    data: string;
    extension: string;
    raw?: any;
};

export class StandardStrategy implements GenerationStrategy {
    constructor(
        private llm: LlmClient,
        private messageBuilder: MessageBuilder
    ) {}

    private extractContent(message: z.infer<typeof responseSchema>['choices'][0]['message']): ExtractedContent {
        if (message.audio) {
            return { type: 'audio', data: message.audio.data, extension: 'wav' };
        }
        if (message.images && message.images.length > 0) {
            return { type: 'image', data: message.images[0].image_url.url, extension: 'png' };
        }

        if (typeof message.content === 'string') {
            return { type: 'text', data: message.content, extension: 'md' };
        }

        return { type: 'text', data: '', extension: 'md' };
    }

    private async validateContent(
        extracted: ExtractedContent,
        config: StepConfig,
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        skipCommands: boolean
    ): Promise<ExtractedContent> {
        let validated = { ...extracted };

        if (validated.type === 'text' && config.jsonSchema) {
            try {
                const data = JSON.parse(validated.data);
                validated.data = JSON.stringify(data, null, 2);
                if (validated.raw === undefined) {