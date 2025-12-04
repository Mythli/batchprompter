import { z } from 'zod';
import { ZodLlmQuerier } from "./zodLlmQuerier.js";
import { AskGptFunction } from "./createCachedGptAsk.js";

const customDomainSchema = z.object({
    isCustomDomain: z.boolean().describe("True if the domain is a custom business domain, false if it's a public email provider (like gmail.com, yahoo.com, etc.)."),
    reason: z.string().describe("A brief explanation for the decision."),
});

export type IsCustomDomainResult = z.infer<typeof customDomainSchema>;

export type IsCustomDomainDependencies = {
    ask: AskGptFunction;
}

export class IsCustomDomain {
    protected zodLlmQuerier: ZodLlmQuerier;

    constructor(dependencies: IsCustomDomainDependencies) {
        this.zodLlmQuerier = new ZodLlmQuerier(dependencies.ask);
    }

    private getDomainFromEmail(email: string): string | null {
        const atIndex = email.lastIndexOf('@');
        if (atIndex === -1) {
            return null;
        }
        return email.substring(atIndex + 1);
    }

    public async check(email: string): Promise<IsCustomDomainResult> {
        const domain = this.getDomainFromEmail(email);
        if (!domain) {
            throw new Error("Invalid email address provided.");
        }

        const mainInstruction = `You are an expert in identifying email domain types. Your task is to determine if a given domain is a custom domain (typically used by a business or organization) or a public/free email provider (like gmail.com, outlook.com, yahoo.com, etc.).

- **Custom Domain:** A domain that is privately owned and used for a specific entity, e.g., 'example.com' in 'contact@example.com'.
- **Public Provider:** A domain that offers free or paid email services to the general public, e.g., 'gmail.com' in 'user@gmail.com'.

Analyze the domain and respond in the requested JSON format.`;

        const userMessagePayload = [
            {
                type: "text" as const,
                text: `Please analyze the following domain: **${domain}**`
            }
        ];

        const result = await this.zodLlmQuerier.query(
            mainInstruction,
            userMessagePayload,
            customDomainSchema,
            {
                maxRetries: 2,
            }
        );

        return result;
    }
}
