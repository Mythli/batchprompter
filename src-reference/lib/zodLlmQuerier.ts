// zodLlmQuerier.ts
import OpenAI from 'openai'; // Import the OpenAI library
import {ZodObject, z, ZodError} from 'zod';
import {zodToJsonSchema} from "zod-to-json-schema";
import { executeWithRetry, RetryValidationResult } from "./retryUtils.js";
import {AskGptFunction, GptAskOptions, OpenRouterResponseFormat} from "./createCachedGptAsk.js";
import {omit} from "lodash-es"; // Adjust path as needed

// LlmContentPart will now directly use OpenAI's type
// export interface LlmContentPart { ... } // This is no longer needed

// Define the structure of feedback passed between retry attempts
export type LlmExtractionFeedback = {
    type: 'NO_RESPONSE' | 'JSON_PARSE_ERROR' | 'SCHEMA_VALIDATION_ERROR' | 'OPERATION_EXCEPTION';
    message?: string;
    details?: any;
    rawResponseSnippet?: string | null;
};

export type ZodLlmQuerierOptions = Omit<GptAskOptions, 'messages' | 'response_format'> & {
    maxRetries: number;
    /**
     * If true, passes `response_format: { type: 'json_object' }` to the model.
     * If false, only includes the schema in the system prompt.
     * Defaults to true.
     */
    useResponseFormat?: boolean;
}

export class ZodLlmQuerier {
    constructor(protected ask: AskGptFunction) {}

    private async _performLlmAttempt(
        attemptNumber: number,
        mainInstruction: string,
        // Use OpenAI's type for user message content parts
        userMessagePayload: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        schemaJsonString: string,
        gptAskOptions?: ZodLlmQuerierOptions,
        previousFeedback?: LlmExtractionFeedback
    ): Promise<string | null> {
        let systemPromptText: string;

        const commonPromptFooter = `
Your response MUST be a single JSON object that strictly adheres to the following JSON schema.
Your response MUST start with '{' and end with '}'.
Do NOT include any other text, explanations, or markdown formatting (like \`\`\`json) before or after the JSON object.

JSON schema:
${schemaJsonString}`;

        if (attemptNumber === 0 || !previousFeedback) {
            systemPromptText = `${mainInstruction}\n${commonPromptFooter}`;
        } else {
            let errorFeedbackIntro = "Your previous attempt to extract data was unsuccessful.";
            let specificErrorDetails = "";

            switch (previousFeedback.type) {
                case 'NO_RESPONSE':
                    specificErrorDetails = "Your previous attempt resulted in no response. Please ensure you generate a response.";
                    break;
                case 'JSON_PARSE_ERROR':
                    specificErrorDetails = `The JSON in your previous response was malformed. Error: ${previousFeedback.message}. Ensure the JSON is syntactically correct. Content snippet: "${previousFeedback.rawResponseSnippet || 'N/A'}"`;
                    break;
                case 'SCHEMA_VALIDATION_ERROR':
                    specificErrorDetails = `Your previous JSON response failed schema validation. Errors: ${JSON.stringify(previousFeedback.details, null, 2)}. Please correct these issues.`;
                    break;
                case 'OPERATION_EXCEPTION':
                    specificErrorDetails = `A system error occurred: ${previousFeedback.message}. Please try to generate the correct JSON output again, adhering to the schema.`;
                    break;
                default:
                    specificErrorDetails = "An unspecified error occurred. Please review the schema and try again."
            }

            systemPromptText = `SYSTEM ADVISORY: This is attempt ${attemptNumber + 1}.
${errorFeedbackIntro}
Specific feedback: ${specificErrorDetails}

Original Task: ${mainInstruction}

Please re-evaluate the provided content and generate a new response, paying close attention to the feedback and the required JSON schema.
${commonPromptFooter}`;
        }

        try {
            const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
                { role: "system", content: systemPromptText },
                { role: "user", content: userMessagePayload }
            ];

            const useResponseFormat = gptAskOptions?.useResponseFormat ?? true;
            const response_format: OpenRouterResponseFormat | undefined = useResponseFormat
                ? { type: 'json_object' }
                : undefined;

            const completion = await this.ask({
                messages: messages,
                response_format: response_format,
                ...omit(gptAskOptions, ['maxRetries', 'useResponseFormat']),
            });
            return completion;
        } catch (error) {
            if (error instanceof OpenAI.APIError) {
                console.error("OpenAI API Error:", error.status, error.name, error.message);
                // Potentially convert to an LlmExtractionFeedback type or rethrow
                throw error; // Or handle more gracefully for retry
            }
            console.error("Error calling OpenAI API:", error);
            throw error; // Or handle more gracefully
        }
    }

    // _processAndValidateLlmResponse remains the same as it deals with the string response
    private _processAndValidateLlmResponse<SchemaType extends ZodObject<any, any, any>>(
        llmResponseString: string | null,
        dataExtractionSchema: SchemaType,
        _attemptNumber: number
    ): Promise<RetryValidationResult<z.infer<SchemaType>, LlmExtractionFeedback>> {
        const rawResponseSnippetForFeedback = llmResponseString
            ? (llmResponseString.substring(0, 500) + (llmResponseString.length > 500 ? "..." : ""))
            : null;

        if (!llmResponseString) {
            return Promise.resolve({
                isValid: false,
                feedbackForNextAttempt: {
                    type: 'NO_RESPONSE',
                    rawResponseSnippet: null,
                }
            });
        }

        // With response_format: { type: "json_object" } or { type: "json_schema" }, the LLM should return a raw JSON string.
        let jsonDataToParse: string = llmResponseString.trim();

        // Robust handling for responses wrapped in markdown code blocks
        const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
        const match = codeBlockRegex.exec(jsonDataToParse);
        if (match && match[1]) {
            jsonDataToParse = match[1].trim();
        }

        if (jsonDataToParse === "") {
            return Promise.resolve({
                isValid: false,
                feedbackForNextAttempt: {
                    type: 'JSON_PARSE_ERROR',
                    message: "LLM returned an empty string.",
                    rawResponseSnippet: rawResponseSnippetForFeedback,
                }
            });
        }

        let jsonData: any;
        try {
            jsonData = JSON.parse(jsonDataToParse);
        } catch (parseError: any) {
            return Promise.resolve({
                isValid: false,
                feedbackForNextAttempt: {
                    type: 'JSON_PARSE_ERROR',
                    message: parseError.message,
                    rawResponseSnippet: rawResponseSnippetForFeedback,
                }
            });
        }

        try {
            const validatedData = dataExtractionSchema.parse(jsonData);
            return Promise.resolve({ isValid: true, data: validatedData });
        } catch (validationError: any) {
            if (validationError instanceof ZodError) {
                return Promise.resolve({
                    isValid: false,
                    feedbackForNextAttempt: {
                        type: 'SCHEMA_VALIDATION_ERROR',
                        message: validationError.message,
                        details: validationError.format(),
                        rawResponseSnippet: JSON.stringify(jsonData, null, 2).substring(0, 500) + (JSON.stringify(jsonData, null, 2).length > 500 ? "..." : "")
                    }
                });
            } else {
                return Promise.resolve({
                    isValid: false,
                    isCriticalFailure: true,
                    feedbackForNextAttempt: {
                        type: 'OPERATION_EXCEPTION',
                        message: `Unexpected error during Zod parsing: ${validationError.message}`,
                        details: validationError.stack,
                        rawResponseSnippet: JSON.stringify(jsonData, null, 2).substring(0, 500) + (JSON.stringify(jsonData, null, 2).length > 500 ? "..." : "")
                    }
                });
            }
        }
    }


    public async query<T extends ZodObject<any, any, any>>(
        mainInstruction: string,
        userMessagePayload: OpenAI.Chat.Completions.ChatCompletionContentPart[], // Use OpenAI's type
        dataExtractionSchema: T,
        options: ZodLlmQuerierOptions
    ): Promise<z.infer<T>> {
        const schemaJsonString = JSON.stringify(zodToJsonSchema(dataExtractionSchema as any, {target: 'jsonSchema7'}));

        const operation = (attempt: number, feedback?: LlmExtractionFeedback) =>
            this._performLlmAttempt(
                attempt,
                mainInstruction,
                userMessagePayload,
                schemaJsonString,
                options,
                feedback
            );

        const validateAndProcess = (rawResult: string | null, attempt: number) =>
            this._processAndValidateLlmResponse(rawResult, dataExtractionSchema, attempt);

        const result = await executeWithRetry<string | null, z.infer<T>, LlmExtractionFeedback>(
            operation,
            validateAndProcess,
            options.maxRetries
        );
        return result;
    }
}
