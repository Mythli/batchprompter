import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createLlm } from '../src/llmFactory.js';
import { createMockOpenAI } from '../src/createMockOpenAI.js';

describe('Conversation Integration', () => {
    it('should maintain history across multiple turns including retries', async () => {
        const Schema = z.object({
            age: z.number()
        });

        // Define the sequence of responses for the mock
        const responses = [
            "The capital of France is Paris.", // 1. Response to promptText
            "I am twenty years old.",          // 2. First response to promptZod (invalid JSON)
            "{\"age\": 20}"                    // 3. Second response to promptZod (retry success)
        ];

        const mockOpenAI = createMockOpenAI(responses);
        
        const llm = createLlm({
            openai: mockOpenAI,
            defaultModel: 'test-model',
            retryBaseDelay: 0 
        });

        const conv = llm.createConversation();

        // Turn 1: Raw prompt call
        const text = await conv.promptText("What is the capital of France?");
        expect(text).toContain("Paris");

        // Turn 2: promptZod call that requires a retry
        // We disable the internal JSON fixer to force the main retry loop 
        // which uses the prompt function (spyPrompt) for retries.
        const result = await conv.promptZod("How old am I?", Schema, { 
            maxRetries: 1,
            disableJsonFixer: true 
        });
        expect(result.age).toBe(20);

        // Check conversation history
        const messages = conv.getMessages();

        // Turn 1 messages:
        // 0: User: What is the capital of France?
        // 1: Assistant: The capital of France is Paris.
        
        // Turn 2 messages:
        // 2: User: How old am I?
        // 3: Assistant: {"age": 20}
        
        // Note: System messages (like the one injected by promptZod) are NOT in history.
        // Intermediate retry messages (the broken "I am twenty years old" and the error feedback)
        // are not captured in the state by createConversation's wrapMethod because it focuses 
        // on the successful turn outcome.
        
        expect(messages.length).toBe(4);
        
        expect(messages[0].role).toBe('user');
        expect(messages[0].content).toBe("What is the capital of France?");
        
        expect(messages[1].role).toBe('assistant');
        expect(messages[1].content).toBe("The capital of France is Paris.");

        expect(messages[2].role).toBe('user');
        expect(messages[2].content).toBe("How old am I?");

        expect(messages[3].role).toBe('assistant');
        expect(messages[3].content).toBe("{\"age\": 20}");
    });

    it('should support initial system messages and concatenate them with call-specific ones', async () => {
        const mockOpenAI = createMockOpenAI(["Response"]);
        const llm = createLlm({ openai: mockOpenAI, defaultModel: 'test' });

        const conv = llm.createConversation([
            { role: 'system', content: 'Base System' }
        ]);

        await conv.promptText("Hello");

        // Check what was sent to OpenAI
        const lastCall = mockOpenAI.chat.completions.create.mock.calls[0][0];
        const sentMessages = lastCall.messages;

        expect(sentMessages[0].role).toBe('system');
        expect(sentMessages[0].content).toBe('Base System');
        expect(sentMessages[1].role).toBe('user');
        expect(sentMessages[1].content).toBe('Hello');

        // Now check concatenation with promptZod
        mockOpenAI.chat.completions.create.mockClear();
        mockOpenAI.addResponse("{\"age\": 20}");

        await conv.promptZod("How old?", z.object({ age: z.number() }));

        const secondCall = mockOpenAI.chat.completions.create.mock.calls[0][0];
        const sentMessages2 = secondCall.messages;

        expect(sentMessages2[0].role).toBe('system');
        // Base System + promptZod's system message
        expect(sentMessages2[0].content).toContain('Base System');
        expect(sentMessages2[0].content).toContain('You are a helpful assistant');
        
        // History should still exclude system messages
        const history = conv.getMessages();
        expect(history.some(m => m.role === 'system')).toBe(false);
    });
});
