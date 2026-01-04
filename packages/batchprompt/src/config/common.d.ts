import { z } from 'zod';
/**
 * Prompt definition - can be a simple string (auto-detected as file path or inline text)
 * or an object with explicit type
 */
export declare const PromptDefSchema: z.ZodUnion<[z.ZodString, z.ZodObject<{
    file: z.ZodOptional<z.ZodString>;
    text: z.ZodOptional<z.ZodString>;
    parts: z.ZodOptional<z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["text", "image", "audio"]>;
        content: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "text" | "image" | "audio";
        content: string;
    }, {
        type: "text" | "image" | "audio";
        content: string;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    text?: string | undefined;
    file?: string | undefined;
    parts?: {
        type: "text" | "image" | "audio";
        content: string;
    }[] | undefined;
}, {
    text?: string | undefined;
    file?: string | undefined;
    parts?: {
        type: "text" | "image" | "audio";
        content: string;
    }[] | undefined;
}>]>;
/**
 * Standard Model configuration (nested structure)
 * Used for main step model, judge, feedback, etc.
 */
export declare const ModelConfigSchema: z.ZodObject<{
    model: z.ZodOptional<z.ZodString>;
    temperature: z.ZodOptional<z.ZodNumber>;
    thinkingLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
    prompt: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
        file: z.ZodOptional<z.ZodString>;
        text: z.ZodOptional<z.ZodString>;
        parts: z.ZodOptional<z.ZodArray<z.ZodObject<{
            type: z.ZodEnum<["text", "image", "audio"]>;
            content: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "text" | "image" | "audio";
            content: string;
        }, {
            type: "text" | "image" | "audio";
            content: string;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        text?: string | undefined;
        file?: string | undefined;
        parts?: {
            type: "text" | "image" | "audio";
            content: string;
        }[] | undefined;
    }, {
        text?: string | undefined;
        file?: string | undefined;
        parts?: {
            type: "text" | "image" | "audio";
            content: string;
        }[] | undefined;
    }>]>>;
    system: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
        file: z.ZodOptional<z.ZodString>;
        text: z.ZodOptional<z.ZodString>;
        parts: z.ZodOptional<z.ZodArray<z.ZodObject<{
            type: z.ZodEnum<["text", "image", "audio"]>;
            content: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "text" | "image" | "audio";
            content: string;
        }, {
            type: "text" | "image" | "audio";
            content: string;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        text?: string | undefined;
        file?: string | undefined;
        parts?: {
            type: "text" | "image" | "audio";
            content: string;
        }[] | undefined;
    }, {
        text?: string | undefined;
        file?: string | undefined;
        parts?: {
            type: "text" | "image" | "audio";
            content: string;
        }[] | undefined;
    }>]>>;
}, "strip", z.ZodTypeAny, {
    system?: string | {
        text?: string | undefined;
        file?: string | undefined;
        parts?: {
            type: "text" | "image" | "audio";
            content: string;
        }[] | undefined;
    } | undefined;
    prompt?: string | {
        text?: string | undefined;
        file?: string | undefined;
        parts?: {
            type: "text" | "image" | "audio";
            content: string;
        }[] | undefined;
    } | undefined;
    model?: string | undefined;
    temperature?: number | undefined;
    thinkingLevel?: "high" | "low" | "medium" | undefined;
}, {
    system?: string | {
        text?: string | undefined;
        file?: string | undefined;
        parts?: {
            type: "text" | "image" | "audio";
            content: string;
        }[] | undefined;
    } | undefined;
    prompt?: string | {
        text?: string | undefined;
        file?: string | undefined;
        parts?: {
            type: "text" | "image" | "audio";
            content: string;
        }[] | undefined;
    } | undefined;
    model?: string | undefined;
    temperature?: number | undefined;
    thinkingLevel?: "high" | "low" | "medium" | undefined;
}>;
/**
 * Helper to create flat model config fields for plugins.
 * e.g. createFlatModelSchema('navigator') creates:
 * {
 *   navigatorModel: z.string().optional(),
 *   navigatorTemperature: z.number().optional(),
 *   ...
 * }
 */
export declare const createFlatModelSchema: (prefix: string) => {
    [x: string]: z.ZodOptional<z.ZodString> | z.ZodOptional<z.ZodNumber> | z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>> | z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
        file: z.ZodOptional<z.ZodString>;
        text: z.ZodOptional<z.ZodString>;
        parts: z.ZodOptional<z.ZodArray<z.ZodObject<{
            type: z.ZodEnum<["text", "image", "audio"]>;
            content: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "text" | "image" | "audio";
            content: string;
        }, {
            type: "text" | "image" | "audio";
            content: string;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        text?: string | undefined;
        file?: string | undefined;
        parts?: {
            type: "text" | "image" | "audio";
            content: string;
        }[] | undefined;
    }, {
        text?: string | undefined;
        file?: string | undefined;
        parts?: {
            type: "text" | "image" | "audio";
            content: string;
        }[] | undefined;
    }>]>>;
};
/**
 * Output configuration
 */
export declare const OutputConfigSchema: z.ZodObject<{
    mode: z.ZodDefault<z.ZodEnum<["merge", "column", "ignore"]>>;
    column: z.ZodOptional<z.ZodString>;
    explode: z.ZodDefault<z.ZodBoolean>;
    limit: z.ZodOptional<z.ZodNumber>;
    offset: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    explode: boolean;
    mode: "merge" | "column" | "ignore";
    offset?: number | undefined;
    column?: string | undefined;
    limit?: number | undefined;
}, {
    offset?: number | undefined;
    column?: string | undefined;
    limit?: number | undefined;
    explode?: boolean | undefined;
    mode?: "merge" | "column" | "ignore" | undefined;
}>;
/**
 * Base plugin schema - used for type inference in generic contexts
 */
export declare const BasePluginSchema: z.ZodObject<{
    type: z.ZodString;
    id: z.ZodOptional<z.ZodString>;
    output: z.ZodDefault<z.ZodObject<{
        mode: z.ZodDefault<z.ZodEnum<["merge", "column", "ignore"]>>;
        column: z.ZodOptional<z.ZodString>;
        explode: z.ZodDefault<z.ZodBoolean>;
        limit: z.ZodOptional<z.ZodNumber>;
        offset: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        explode: boolean;
        mode: "merge" | "column" | "ignore";
        offset?: number | undefined;
        column?: string | undefined;
        limit?: number | undefined;
    }, {
        offset?: number | undefined;
        column?: string | undefined;
        limit?: number | undefined;
        explode?: boolean | undefined;
        mode?: "merge" | "column" | "ignore" | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    type: string;
    output: {
        explode: boolean;
        mode: "merge" | "column" | "ignore";
        offset?: number | undefined;
        column?: string | undefined;
        limit?: number | undefined;
    };
    id?: string | undefined;
}, {
    type: string;
    output?: {
        offset?: number | undefined;
        column?: string | undefined;
        limit?: number | undefined;
        explode?: boolean | undefined;
        mode?: "merge" | "column" | "ignore" | undefined;
    } | undefined;
    id?: string | undefined;
}>;
//# sourceMappingURL=common.d.ts.map