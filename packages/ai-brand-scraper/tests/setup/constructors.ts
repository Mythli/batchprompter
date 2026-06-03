import type { z } from 'zod';
import type {
    AiBrandLlm,
    AiBrandMessage,
    PageActionExecutor,
} from '../../src/index.js';

function textFromMessages(messages: AiBrandMessage[]): string {
    return messages.map(message => {
        const content = message.content;
        if (typeof content === 'string') {
            return content;
        }
        if (Array.isArray(content)) {
            return content.map(part => part.type === 'text' ? part.text : JSON.stringify(part)).join('\n');
        }
        return '';
    }).join('\n');
}

export class ConstructorLlm implements AiBrandLlm {
    public extractionPrompts = 0;
    public colorPrompts = 0;

    async promptZod<TSchema extends z.ZodTypeAny>(
        messages: AiBrandMessage[],
        _schema: TSchema
    ): Promise<z.infer<TSchema>> {
        const text = textFromMessages(messages);

        if (text.includes('Potentially relevant CSS')) {
            this.extractionPrompts++;
            return { logoUrls: [] } as z.infer<TSchema>;
        }

        this.colorPrompts++;
        return {
            brandColors: [
                { hex: '#0b5fff', isDark: true, contrastColor: '#ffffff' },
            ],
        } as z.infer<TSchema>;
    }

    async promptText(_options: { messages: AiBrandMessage[] }): Promise<string> {
        throw new Error('promptText should not be called by this constructor test');
    }
}

export const brandCaptureExecutor: PageActionExecutor = {
    async executeOnPage(request) {
        return {
            pageHtml: '<html><head><title>Example</title></head><body></body></html>',
            pageCss: [
                {
                    url: `${request.url}/styles.css`,
                    content: '.logo { background-image: url("/logo.svg"); }',
                },
            ],
            siteTitle: 'Example',
            screenshotBase64: 'data:image/png;base64,aGVsbG8=',
            finalUrl: request.url,
            faviconUrls: [],
            inlineLogoDataUris: [],
        };
    },
};

export const styleExecutor: PageActionExecutor = {
    async executeOnPage() {
        return {
            screenshots: [],
            compositeImageBase64: undefined,
        };
    },
};
