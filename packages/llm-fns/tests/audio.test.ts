import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createTestLlm } from './setup.js';
import { env } from './env.js';

describe('Audio LLM Integration', () => {
    it('should generate streamed audio and write it to a file', async () => {
        const { llm } = await createTestLlm();
        const format = 'pcm16';

        const audio = await llm.promptAudio({
            model: env.TEST_AUDIO_MODEL,
            messages: 'Say exactly: BatchPrompt audio test.',
            modalities: ['text', 'audio'],
            audio: {
                voice: 'alloy',
                format
            },
            audioTransport: 'chat-stream',
            retries: 1,
            requestOptions: {
                timeout: 120_000
            }
        });

        const outputPath = path.join(os.tmpdir(), `llm-fns-audio-test-${Date.now()}.pcm`);
        await fs.writeFile(outputPath, audio);
        const stats = await fs.stat(outputPath);

        expect(audio.length).toBeGreaterThan(0);
        expect(stats.size).toBe(audio.length);
    }, 180_000);
});
