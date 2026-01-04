import { z } from 'zod';
export declare const SafeStepConfigSchema: z.ZodObject<Omit<{
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
    model: z.ZodOptional<z.ZodObject<{
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
    }>>;
    plugins: z.ZodDefault<z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        type: z.ZodLiteral<"web-search">;
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
        query: z.ZodOptional<z.ZodString>;
        queryModel: z.ZodOptional<z.ZodString>;
        queryTemperature: z.ZodOptional<z.ZodNumber>;
        queryThinkingLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
        queryPrompt: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
        querySystem: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
        selectModel: z.ZodOptional<z.ZodString>;
        selectTemperature: z.ZodOptional<z.ZodNumber>;
        selectThinkingLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
        selectPrompt: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
        selectSystem: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
        compressModel: z.ZodOptional<z.ZodString>;
        compressTemperature: z.ZodOptional<z.ZodNumber>;
        compressThinkingLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
        compressPrompt: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
        compressSystem: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
        limit: z.ZodDefault<z.ZodNumber>;
        mode: z.ZodDefault<z.ZodEnum<["none", "markdown", "html"]>>;
        queryCount: z.ZodDefault<z.ZodNumber>;
        maxPages: z.ZodDefault<z.ZodNumber>;
        dedupeStrategy: z.ZodDefault<z.ZodEnum<["none", "domain", "url"]>>;
        gl: z.ZodOptional<z.ZodString>;
        hl: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "web-search";
        output: {
            explode: boolean;
            mode: "merge" | "column" | "ignore";
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
        };
        limit: number;
        mode: "html" | "markdown" | "none";
        queryCount: number;
        maxPages: number;
        dedupeStrategy: "none" | "url" | "domain";
        id?: string | undefined;
        gl?: string | undefined;
        hl?: string | undefined;
        query?: string | undefined;
        queryModel?: string | undefined;
        queryTemperature?: number | undefined;
        queryThinkingLevel?: "high" | "low" | "medium" | undefined;
        queryPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        querySystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        selectModel?: string | undefined;
        selectTemperature?: number | undefined;
        selectThinkingLevel?: "high" | "low" | "medium" | undefined;
        selectPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        selectSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        compressModel?: string | undefined;
        compressTemperature?: number | undefined;
        compressThinkingLevel?: "high" | "low" | "medium" | undefined;
        compressPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        compressSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
    }, {
        type: "web-search";
        output?: {
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
            explode?: boolean | undefined;
            mode?: "merge" | "column" | "ignore" | undefined;
        } | undefined;
        id?: string | undefined;
        limit?: number | undefined;
        gl?: string | undefined;
        hl?: string | undefined;
        mode?: "html" | "markdown" | "none" | undefined;
        query?: string | undefined;
        queryModel?: string | undefined;
        queryTemperature?: number | undefined;
        queryThinkingLevel?: "high" | "low" | "medium" | undefined;
        queryPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        querySystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        selectModel?: string | undefined;
        selectTemperature?: number | undefined;
        selectThinkingLevel?: "high" | "low" | "medium" | undefined;
        selectPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        selectSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        compressModel?: string | undefined;
        compressTemperature?: number | undefined;
        compressThinkingLevel?: "high" | "low" | "medium" | undefined;
        compressPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        compressSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        queryCount?: number | undefined;
        maxPages?: number | undefined;
        dedupeStrategy?: "none" | "url" | "domain" | undefined;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"image-search">;
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
        query: z.ZodOptional<z.ZodString>;
        queryModel: z.ZodOptional<z.ZodString>;
        queryTemperature: z.ZodOptional<z.ZodNumber>;
        queryThinkingLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
        queryPrompt: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
        querySystem: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
        selectModel: z.ZodOptional<z.ZodString>;
        selectTemperature: z.ZodOptional<z.ZodNumber>;
        selectThinkingLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
        selectPrompt: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
        selectSystem: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
        limit: z.ZodDefault<z.ZodNumber>;
        select: z.ZodDefault<z.ZodNumber>;
        queryCount: z.ZodDefault<z.ZodNumber>;
        spriteSize: z.ZodDefault<z.ZodNumber>;
        maxPages: z.ZodDefault<z.ZodNumber>;
        dedupeStrategy: z.ZodDefault<z.ZodEnum<["none", "domain", "url"]>>;
        gl: z.ZodOptional<z.ZodString>;
        hl: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "image-search";
        output: {
            explode: boolean;
            mode: "merge" | "column" | "ignore";
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
        };
        select: number;
        limit: number;
        queryCount: number;
        maxPages: number;
        dedupeStrategy: "none" | "url" | "domain";
        spriteSize: number;
        id?: string | undefined;
        gl?: string | undefined;
        hl?: string | undefined;
        query?: string | undefined;
        queryModel?: string | undefined;
        queryTemperature?: number | undefined;
        queryThinkingLevel?: "high" | "low" | "medium" | undefined;
        queryPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        querySystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        selectModel?: string | undefined;
        selectTemperature?: number | undefined;
        selectThinkingLevel?: "high" | "low" | "medium" | undefined;
        selectPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        selectSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
    }, {
        type: "image-search";
        output?: {
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
            explode?: boolean | undefined;
            mode?: "merge" | "column" | "ignore" | undefined;
        } | undefined;
        select?: number | undefined;
        id?: string | undefined;
        limit?: number | undefined;
        gl?: string | undefined;
        hl?: string | undefined;
        query?: string | undefined;
        queryModel?: string | undefined;
        queryTemperature?: number | undefined;
        queryThinkingLevel?: "high" | "low" | "medium" | undefined;
        queryPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        querySystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        selectModel?: string | undefined;
        selectTemperature?: number | undefined;
        selectThinkingLevel?: "high" | "low" | "medium" | undefined;
        selectPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        selectSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        queryCount?: number | undefined;
        maxPages?: number | undefined;
        dedupeStrategy?: "none" | "url" | "domain" | undefined;
        spriteSize?: number | undefined;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"website-agent">;
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
        url: z.ZodEffects<z.ZodString, string, string>;
        schema: z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodAny>, Record<string, any>, Record<string, any>>;
        budget: z.ZodDefault<z.ZodNumber>;
        batchSize: z.ZodDefault<z.ZodNumber>;
        navigatorModel: z.ZodOptional<z.ZodString>;
        navigatorTemperature: z.ZodOptional<z.ZodNumber>;
        navigatorThinkingLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
        navigatorPrompt: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
        navigatorSystem: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
        extractModel: z.ZodOptional<z.ZodString>;
        extractTemperature: z.ZodOptional<z.ZodNumber>;
        extractThinkingLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
        extractPrompt: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
        extractSystem: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
        mergeModel: z.ZodOptional<z.ZodString>;
        mergeTemperature: z.ZodOptional<z.ZodNumber>;
        mergeThinkingLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
        mergePrompt: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
        mergeSystem: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
        schema: Record<string, any>;
        type: "website-agent";
        output: {
            explode: boolean;
            mode: "merge" | "column" | "ignore";
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
        };
        url: string;
        budget: number;
        batchSize: number;
        id?: string | undefined;
        navigatorModel?: string | undefined;
        navigatorTemperature?: number | undefined;
        navigatorThinkingLevel?: "high" | "low" | "medium" | undefined;
        navigatorPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        navigatorSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        extractModel?: string | undefined;
        extractTemperature?: number | undefined;
        extractThinkingLevel?: "high" | "low" | "medium" | undefined;
        extractPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        extractSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        mergeModel?: string | undefined;
        mergeTemperature?: number | undefined;
        mergeThinkingLevel?: "high" | "low" | "medium" | undefined;
        mergePrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        mergeSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
    }, {
        schema: Record<string, any>;
        type: "website-agent";
        url: string;
        output?: {
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
            explode?: boolean | undefined;
            mode?: "merge" | "column" | "ignore" | undefined;
        } | undefined;
        id?: string | undefined;
        budget?: number | undefined;
        batchSize?: number | undefined;
        navigatorModel?: string | undefined;
        navigatorTemperature?: number | undefined;
        navigatorThinkingLevel?: "high" | "low" | "medium" | undefined;
        navigatorPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        navigatorSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        extractModel?: string | undefined;
        extractTemperature?: number | undefined;
        extractThinkingLevel?: "high" | "low" | "medium" | undefined;
        extractPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        extractSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        mergeModel?: string | undefined;
        mergeTemperature?: number | undefined;
        mergeThinkingLevel?: "high" | "low" | "medium" | undefined;
        mergePrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        mergeSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"style-scraper">;
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
        url: z.ZodEffects<z.ZodString, string, string>;
        resolution: z.ZodDefault<z.ZodString>;
        mobile: z.ZodDefault<z.ZodBoolean>;
        interactive: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        type: "style-scraper";
        output: {
            explode: boolean;
            mode: "merge" | "column" | "ignore";
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
        };
        resolution: string;
        url: string;
        mobile: boolean;
        interactive: boolean;
        id?: string | undefined;
    }, {
        type: "style-scraper";
        url: string;
        output?: {
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
            explode?: boolean | undefined;
            mode?: "merge" | "column" | "ignore" | undefined;
        } | undefined;
        resolution?: string | undefined;
        id?: string | undefined;
        mobile?: boolean | undefined;
        interactive?: boolean | undefined;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"validation">;
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
        schema: z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodAny>, Record<string, any>, Record<string, any>>;
        target: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    }, "strip", z.ZodTypeAny, {
        schema: Record<string, any>;
        type: "validation";
        output: {
            explode: boolean;
            mode: "merge" | "column" | "ignore";
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
        };
        id?: string | undefined;
        target?: string | undefined;
    }, {
        schema: Record<string, any>;
        type: "validation";
        output?: {
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
            explode?: boolean | undefined;
            mode?: "merge" | "column" | "ignore" | undefined;
        } | undefined;
        id?: string | undefined;
        target?: string | undefined;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"dedupe">;
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
        key: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        type: "dedupe";
        output: {
            explode: boolean;
            mode: "merge" | "column" | "ignore";
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
        };
        key: string;
        id?: string | undefined;
    }, {
        type: "dedupe";
        key: string;
        output?: {
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
            explode?: boolean | undefined;
            mode?: "merge" | "column" | "ignore" | undefined;
        } | undefined;
        id?: string | undefined;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"logo-scraper">;
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
        url: z.ZodEffects<z.ZodString, string, string>;
        analyzeModel: z.ZodOptional<z.ZodString>;
        analyzeTemperature: z.ZodOptional<z.ZodNumber>;
        analyzeThinkingLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
        analyzePrompt: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
        analyzeSystem: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
        extractModel: z.ZodOptional<z.ZodString>;
        extractTemperature: z.ZodOptional<z.ZodNumber>;
        extractThinkingLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
        extractPrompt: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
        extractSystem: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
        maxCandidates: z.ZodDefault<z.ZodNumber>;
        minScore: z.ZodDefault<z.ZodNumber>;
        logoPath: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        faviconPath: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        logoLimit: z.ZodDefault<z.ZodNumber>;
        faviconLimit: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        type: "logo-scraper";
        output: {
            explode: boolean;
            mode: "merge" | "column" | "ignore";
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
        };
        url: string;
        maxCandidates: number;
        minScore: number;
        logoLimit: number;
        faviconLimit: number;
        id?: string | undefined;
        extractModel?: string | undefined;
        extractTemperature?: number | undefined;
        extractThinkingLevel?: "high" | "low" | "medium" | undefined;
        extractPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        extractSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        analyzeModel?: string | undefined;
        analyzeTemperature?: number | undefined;
        analyzeThinkingLevel?: "high" | "low" | "medium" | undefined;
        analyzePrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        analyzeSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        logoPath?: string | undefined;
        faviconPath?: string | undefined;
    }, {
        type: "logo-scraper";
        url: string;
        output?: {
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
            explode?: boolean | undefined;
            mode?: "merge" | "column" | "ignore" | undefined;
        } | undefined;
        id?: string | undefined;
        extractModel?: string | undefined;
        extractTemperature?: number | undefined;
        extractThinkingLevel?: "high" | "low" | "medium" | undefined;
        extractPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        extractSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        analyzeModel?: string | undefined;
        analyzeTemperature?: number | undefined;
        analyzeThinkingLevel?: "high" | "low" | "medium" | undefined;
        analyzePrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        analyzeSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        maxCandidates?: number | undefined;
        minScore?: number | undefined;
        logoPath?: string | undefined;
        faviconPath?: string | undefined;
        logoLimit?: number | undefined;
        faviconLimit?: number | undefined;
    }>]>, "many">>;
    preprocessors: z.ZodDefault<z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        type: z.ZodLiteral<"url-expander">;
        mode: z.ZodDefault<z.ZodEnum<["fetch", "puppeteer"]>>;
        maxChars: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        type: "url-expander";
        mode: "fetch" | "puppeteer";
        maxChars: number;
    }, {
        type: "url-expander";
        mode?: "fetch" | "puppeteer" | undefined;
        maxChars?: number | undefined;
    }>]>, "many">>;
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
    outputPath: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    schema: z.ZodOptional<z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodAny>, Record<string, any>, Record<string, any>>>;
    candidates: z.ZodDefault<z.ZodNumber>;
    skipCandidateCommand: z.ZodDefault<z.ZodBoolean>;
    judge: z.ZodOptional<z.ZodObject<{
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
    }>>;
    feedback: z.ZodOptional<z.ZodObject<{
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
    } & {
        loops: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        loops: number;
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
        loops?: number | undefined;
    }>>;
    aspectRatio: z.ZodOptional<z.ZodString>;
    command: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    verifyCommand: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    timeout: z.ZodOptional<z.ZodNumber>;
}, "skipCandidateCommand" | "command" | "verifyCommand">, "strip", z.ZodTypeAny, {
    output: {
        explode: boolean;
        mode: "merge" | "column" | "ignore";
        offset?: number | undefined;
        column?: string | undefined;
        limit?: number | undefined;
    };
    plugins: ({
        type: "web-search";
        output: {
            explode: boolean;
            mode: "merge" | "column" | "ignore";
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
        };
        limit: number;
        mode: "html" | "markdown" | "none";
        queryCount: number;
        maxPages: number;
        dedupeStrategy: "none" | "url" | "domain";
        id?: string | undefined;
        gl?: string | undefined;
        hl?: string | undefined;
        query?: string | undefined;
        queryModel?: string | undefined;
        queryTemperature?: number | undefined;
        queryThinkingLevel?: "high" | "low" | "medium" | undefined;
        queryPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        querySystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        selectModel?: string | undefined;
        selectTemperature?: number | undefined;
        selectThinkingLevel?: "high" | "low" | "medium" | undefined;
        selectPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        selectSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        compressModel?: string | undefined;
        compressTemperature?: number | undefined;
        compressThinkingLevel?: "high" | "low" | "medium" | undefined;
        compressPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        compressSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
    } | {
        type: "image-search";
        output: {
            explode: boolean;
            mode: "merge" | "column" | "ignore";
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
        };
        select: number;
        limit: number;
        queryCount: number;
        maxPages: number;
        dedupeStrategy: "none" | "url" | "domain";
        spriteSize: number;
        id?: string | undefined;
        gl?: string | undefined;
        hl?: string | undefined;
        query?: string | undefined;
        queryModel?: string | undefined;
        queryTemperature?: number | undefined;
        queryThinkingLevel?: "high" | "low" | "medium" | undefined;
        queryPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        querySystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        selectModel?: string | undefined;
        selectTemperature?: number | undefined;
        selectThinkingLevel?: "high" | "low" | "medium" | undefined;
        selectPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        selectSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
    } | {
        schema: Record<string, any>;
        type: "website-agent";
        output: {
            explode: boolean;
            mode: "merge" | "column" | "ignore";
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
        };
        url: string;
        budget: number;
        batchSize: number;
        id?: string | undefined;
        navigatorModel?: string | undefined;
        navigatorTemperature?: number | undefined;
        navigatorThinkingLevel?: "high" | "low" | "medium" | undefined;
        navigatorPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        navigatorSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        extractModel?: string | undefined;
        extractTemperature?: number | undefined;
        extractThinkingLevel?: "high" | "low" | "medium" | undefined;
        extractPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        extractSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        mergeModel?: string | undefined;
        mergeTemperature?: number | undefined;
        mergeThinkingLevel?: "high" | "low" | "medium" | undefined;
        mergePrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        mergeSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
    } | {
        type: "style-scraper";
        output: {
            explode: boolean;
            mode: "merge" | "column" | "ignore";
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
        };
        resolution: string;
        url: string;
        mobile: boolean;
        interactive: boolean;
        id?: string | undefined;
    } | {
        schema: Record<string, any>;
        type: "validation";
        output: {
            explode: boolean;
            mode: "merge" | "column" | "ignore";
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
        };
        id?: string | undefined;
        target?: string | undefined;
    } | {
        type: "dedupe";
        output: {
            explode: boolean;
            mode: "merge" | "column" | "ignore";
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
        };
        key: string;
        id?: string | undefined;
    } | {
        type: "logo-scraper";
        output: {
            explode: boolean;
            mode: "merge" | "column" | "ignore";
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
        };
        url: string;
        maxCandidates: number;
        minScore: number;
        logoLimit: number;
        faviconLimit: number;
        id?: string | undefined;
        extractModel?: string | undefined;
        extractTemperature?: number | undefined;
        extractThinkingLevel?: "high" | "low" | "medium" | undefined;
        extractPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        extractSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        analyzeModel?: string | undefined;
        analyzeTemperature?: number | undefined;
        analyzeThinkingLevel?: "high" | "low" | "medium" | undefined;
        analyzePrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        analyzeSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        logoPath?: string | undefined;
        faviconPath?: string | undefined;
    })[];
    preprocessors: {
        type: "url-expander";
        mode: "fetch" | "puppeteer";
        maxChars: number;
    }[];
    candidates: number;
    schema?: Record<string, any> | undefined;
    feedback?: {
        loops: number;
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
    } | undefined;
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
    model?: {
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
    } | undefined;
    outputPath?: string | undefined;
    judge?: {
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
    } | undefined;
    aspectRatio?: string | undefined;
    timeout?: number | undefined;
}, {
    schema?: Record<string, any> | undefined;
    feedback?: {
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
        loops?: number | undefined;
    } | undefined;
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
    output?: {
        offset?: number | undefined;
        column?: string | undefined;
        limit?: number | undefined;
        explode?: boolean | undefined;
        mode?: "merge" | "column" | "ignore" | undefined;
    } | undefined;
    model?: {
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
    } | undefined;
    plugins?: ({
        type: "web-search";
        output?: {
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
            explode?: boolean | undefined;
            mode?: "merge" | "column" | "ignore" | undefined;
        } | undefined;
        id?: string | undefined;
        limit?: number | undefined;
        gl?: string | undefined;
        hl?: string | undefined;
        mode?: "html" | "markdown" | "none" | undefined;
        query?: string | undefined;
        queryModel?: string | undefined;
        queryTemperature?: number | undefined;
        queryThinkingLevel?: "high" | "low" | "medium" | undefined;
        queryPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        querySystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        selectModel?: string | undefined;
        selectTemperature?: number | undefined;
        selectThinkingLevel?: "high" | "low" | "medium" | undefined;
        selectPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        selectSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        compressModel?: string | undefined;
        compressTemperature?: number | undefined;
        compressThinkingLevel?: "high" | "low" | "medium" | undefined;
        compressPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        compressSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        queryCount?: number | undefined;
        maxPages?: number | undefined;
        dedupeStrategy?: "none" | "url" | "domain" | undefined;
    } | {
        type: "image-search";
        output?: {
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
            explode?: boolean | undefined;
            mode?: "merge" | "column" | "ignore" | undefined;
        } | undefined;
        select?: number | undefined;
        id?: string | undefined;
        limit?: number | undefined;
        gl?: string | undefined;
        hl?: string | undefined;
        query?: string | undefined;
        queryModel?: string | undefined;
        queryTemperature?: number | undefined;
        queryThinkingLevel?: "high" | "low" | "medium" | undefined;
        queryPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        querySystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        selectModel?: string | undefined;
        selectTemperature?: number | undefined;
        selectThinkingLevel?: "high" | "low" | "medium" | undefined;
        selectPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        selectSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        queryCount?: number | undefined;
        maxPages?: number | undefined;
        dedupeStrategy?: "none" | "url" | "domain" | undefined;
        spriteSize?: number | undefined;
    } | {
        schema: Record<string, any>;
        type: "website-agent";
        url: string;
        output?: {
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
            explode?: boolean | undefined;
            mode?: "merge" | "column" | "ignore" | undefined;
        } | undefined;
        id?: string | undefined;
        budget?: number | undefined;
        batchSize?: number | undefined;
        navigatorModel?: string | undefined;
        navigatorTemperature?: number | undefined;
        navigatorThinkingLevel?: "high" | "low" | "medium" | undefined;
        navigatorPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        navigatorSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        extractModel?: string | undefined;
        extractTemperature?: number | undefined;
        extractThinkingLevel?: "high" | "low" | "medium" | undefined;
        extractPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        extractSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        mergeModel?: string | undefined;
        mergeTemperature?: number | undefined;
        mergeThinkingLevel?: "high" | "low" | "medium" | undefined;
        mergePrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        mergeSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
    } | {
        type: "style-scraper";
        url: string;
        output?: {
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
            explode?: boolean | undefined;
            mode?: "merge" | "column" | "ignore" | undefined;
        } | undefined;
        resolution?: string | undefined;
        id?: string | undefined;
        mobile?: boolean | undefined;
        interactive?: boolean | undefined;
    } | {
        schema: Record<string, any>;
        type: "validation";
        output?: {
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
            explode?: boolean | undefined;
            mode?: "merge" | "column" | "ignore" | undefined;
        } | undefined;
        id?: string | undefined;
        target?: string | undefined;
    } | {
        type: "dedupe";
        key: string;
        output?: {
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
            explode?: boolean | undefined;
            mode?: "merge" | "column" | "ignore" | undefined;
        } | undefined;
        id?: string | undefined;
    } | {
        type: "logo-scraper";
        url: string;
        output?: {
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
            explode?: boolean | undefined;
            mode?: "merge" | "column" | "ignore" | undefined;
        } | undefined;
        id?: string | undefined;
        extractModel?: string | undefined;
        extractTemperature?: number | undefined;
        extractThinkingLevel?: "high" | "low" | "medium" | undefined;
        extractPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        extractSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        analyzeModel?: string | undefined;
        analyzeTemperature?: number | undefined;
        analyzeThinkingLevel?: "high" | "low" | "medium" | undefined;
        analyzePrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        analyzeSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        maxCandidates?: number | undefined;
        minScore?: number | undefined;
        logoPath?: string | undefined;
        faviconPath?: string | undefined;
        logoLimit?: number | undefined;
        faviconLimit?: number | undefined;
    })[] | undefined;
    preprocessors?: {
        type: "url-expander";
        mode?: "fetch" | "puppeteer" | undefined;
        maxChars?: number | undefined;
    }[] | undefined;
    outputPath?: string | undefined;
    candidates?: number | undefined;
    judge?: {
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
    } | undefined;
    aspectRatio?: string | undefined;
    timeout?: number | undefined;
}>;
export declare const SafePipelineConfigSchema: z.ZodObject<{
    data: z.ZodDefault<z.ZodOptional<z.ZodObject<{
        format: z.ZodDefault<z.ZodEnum<["csv", "json", "auto"]>>;
        offset: z.ZodOptional<z.ZodNumber>;
        limit: z.ZodOptional<z.ZodNumber>;
        rows: z.ZodDefault<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodAny>, "many">>;
    }, "strip", z.ZodTypeAny, {
        format: "json" | "auto" | "csv";
        rows: Record<string, any>[];
        offset?: number | undefined;
        limit?: number | undefined;
    }, {
        offset?: number | undefined;
        limit?: number | undefined;
        format?: "json" | "auto" | "csv" | undefined;
        rows?: Record<string, any>[] | undefined;
    }>>>;
    globals: z.ZodDefault<z.ZodOptional<z.ZodObject<{
        model: z.ZodDefault<z.ZodString>;
        temperature: z.ZodOptional<z.ZodNumber>;
        thinkingLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
        concurrency: z.ZodDefault<z.ZodNumber>;
        taskConcurrency: z.ZodDefault<z.ZodNumber>;
        tmpDir: z.ZodDefault<z.ZodEffects<z.ZodString, string, string>>;
        outputPath: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        dataOutputPath: z.ZodOptional<z.ZodString>;
        timeout: z.ZodDefault<z.ZodNumber>;
        inputLimit: z.ZodOptional<z.ZodNumber>;
        inputOffset: z.ZodOptional<z.ZodNumber>;
        limit: z.ZodOptional<z.ZodNumber>;
        offset: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        model: string;
        concurrency: number;
        taskConcurrency: number;
        timeout: number;
        tmpDir: string;
        offset?: number | undefined;
        limit?: number | undefined;
        temperature?: number | undefined;
        thinkingLevel?: "high" | "low" | "medium" | undefined;
        outputPath?: string | undefined;
        dataOutputPath?: string | undefined;
        inputLimit?: number | undefined;
        inputOffset?: number | undefined;
    }, {
        offset?: number | undefined;
        model?: string | undefined;
        concurrency?: number | undefined;
        taskConcurrency?: number | undefined;
        limit?: number | undefined;
        temperature?: number | undefined;
        thinkingLevel?: "high" | "low" | "medium" | undefined;
        outputPath?: string | undefined;
        timeout?: number | undefined;
        tmpDir?: string | undefined;
        dataOutputPath?: string | undefined;
        inputLimit?: number | undefined;
        inputOffset?: number | undefined;
    }>>>;
    steps: z.ZodArray<z.ZodObject<Omit<{
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
        model: z.ZodOptional<z.ZodObject<{
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
        }>>;
        plugins: z.ZodDefault<z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
            type: z.ZodLiteral<"web-search">;
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
            query: z.ZodOptional<z.ZodString>;
            queryModel: z.ZodOptional<z.ZodString>;
            queryTemperature: z.ZodOptional<z.ZodNumber>;
            queryThinkingLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
            queryPrompt: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
            querySystem: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
            selectModel: z.ZodOptional<z.ZodString>;
            selectTemperature: z.ZodOptional<z.ZodNumber>;
            selectThinkingLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
            selectPrompt: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
            selectSystem: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
            compressModel: z.ZodOptional<z.ZodString>;
            compressTemperature: z.ZodOptional<z.ZodNumber>;
            compressThinkingLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
            compressPrompt: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
            compressSystem: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
            limit: z.ZodDefault<z.ZodNumber>;
            mode: z.ZodDefault<z.ZodEnum<["none", "markdown", "html"]>>;
            queryCount: z.ZodDefault<z.ZodNumber>;
            maxPages: z.ZodDefault<z.ZodNumber>;
            dedupeStrategy: z.ZodDefault<z.ZodEnum<["none", "domain", "url"]>>;
            gl: z.ZodOptional<z.ZodString>;
            hl: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            type: "web-search";
            output: {
                explode: boolean;
                mode: "merge" | "column" | "ignore";
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
            };
            limit: number;
            mode: "html" | "markdown" | "none";
            queryCount: number;
            maxPages: number;
            dedupeStrategy: "none" | "url" | "domain";
            id?: string | undefined;
            gl?: string | undefined;
            hl?: string | undefined;
            query?: string | undefined;
            queryModel?: string | undefined;
            queryTemperature?: number | undefined;
            queryThinkingLevel?: "high" | "low" | "medium" | undefined;
            queryPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            querySystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            selectModel?: string | undefined;
            selectTemperature?: number | undefined;
            selectThinkingLevel?: "high" | "low" | "medium" | undefined;
            selectPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            selectSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            compressModel?: string | undefined;
            compressTemperature?: number | undefined;
            compressThinkingLevel?: "high" | "low" | "medium" | undefined;
            compressPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            compressSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
        }, {
            type: "web-search";
            output?: {
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
                explode?: boolean | undefined;
                mode?: "merge" | "column" | "ignore" | undefined;
            } | undefined;
            id?: string | undefined;
            limit?: number | undefined;
            gl?: string | undefined;
            hl?: string | undefined;
            mode?: "html" | "markdown" | "none" | undefined;
            query?: string | undefined;
            queryModel?: string | undefined;
            queryTemperature?: number | undefined;
            queryThinkingLevel?: "high" | "low" | "medium" | undefined;
            queryPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            querySystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            selectModel?: string | undefined;
            selectTemperature?: number | undefined;
            selectThinkingLevel?: "high" | "low" | "medium" | undefined;
            selectPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            selectSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            compressModel?: string | undefined;
            compressTemperature?: number | undefined;
            compressThinkingLevel?: "high" | "low" | "medium" | undefined;
            compressPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            compressSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            queryCount?: number | undefined;
            maxPages?: number | undefined;
            dedupeStrategy?: "none" | "url" | "domain" | undefined;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"image-search">;
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
            query: z.ZodOptional<z.ZodString>;
            queryModel: z.ZodOptional<z.ZodString>;
            queryTemperature: z.ZodOptional<z.ZodNumber>;
            queryThinkingLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
            queryPrompt: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
            querySystem: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
            selectModel: z.ZodOptional<z.ZodString>;
            selectTemperature: z.ZodOptional<z.ZodNumber>;
            selectThinkingLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
            selectPrompt: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
            selectSystem: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
            limit: z.ZodDefault<z.ZodNumber>;
            select: z.ZodDefault<z.ZodNumber>;
            queryCount: z.ZodDefault<z.ZodNumber>;
            spriteSize: z.ZodDefault<z.ZodNumber>;
            maxPages: z.ZodDefault<z.ZodNumber>;
            dedupeStrategy: z.ZodDefault<z.ZodEnum<["none", "domain", "url"]>>;
            gl: z.ZodOptional<z.ZodString>;
            hl: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            type: "image-search";
            output: {
                explode: boolean;
                mode: "merge" | "column" | "ignore";
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
            };
            select: number;
            limit: number;
            queryCount: number;
            maxPages: number;
            dedupeStrategy: "none" | "url" | "domain";
            spriteSize: number;
            id?: string | undefined;
            gl?: string | undefined;
            hl?: string | undefined;
            query?: string | undefined;
            queryModel?: string | undefined;
            queryTemperature?: number | undefined;
            queryThinkingLevel?: "high" | "low" | "medium" | undefined;
            queryPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            querySystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            selectModel?: string | undefined;
            selectTemperature?: number | undefined;
            selectThinkingLevel?: "high" | "low" | "medium" | undefined;
            selectPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            selectSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
        }, {
            type: "image-search";
            output?: {
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
                explode?: boolean | undefined;
                mode?: "merge" | "column" | "ignore" | undefined;
            } | undefined;
            select?: number | undefined;
            id?: string | undefined;
            limit?: number | undefined;
            gl?: string | undefined;
            hl?: string | undefined;
            query?: string | undefined;
            queryModel?: string | undefined;
            queryTemperature?: number | undefined;
            queryThinkingLevel?: "high" | "low" | "medium" | undefined;
            queryPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            querySystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            selectModel?: string | undefined;
            selectTemperature?: number | undefined;
            selectThinkingLevel?: "high" | "low" | "medium" | undefined;
            selectPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            selectSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            queryCount?: number | undefined;
            maxPages?: number | undefined;
            dedupeStrategy?: "none" | "url" | "domain" | undefined;
            spriteSize?: number | undefined;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"website-agent">;
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
            url: z.ZodEffects<z.ZodString, string, string>;
            schema: z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodAny>, Record<string, any>, Record<string, any>>;
            budget: z.ZodDefault<z.ZodNumber>;
            batchSize: z.ZodDefault<z.ZodNumber>;
            navigatorModel: z.ZodOptional<z.ZodString>;
            navigatorTemperature: z.ZodOptional<z.ZodNumber>;
            navigatorThinkingLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
            navigatorPrompt: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
            navigatorSystem: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
            extractModel: z.ZodOptional<z.ZodString>;
            extractTemperature: z.ZodOptional<z.ZodNumber>;
            extractThinkingLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
            extractPrompt: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
            extractSystem: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
            mergeModel: z.ZodOptional<z.ZodString>;
            mergeTemperature: z.ZodOptional<z.ZodNumber>;
            mergeThinkingLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
            mergePrompt: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
            mergeSystem: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
            schema: Record<string, any>;
            type: "website-agent";
            output: {
                explode: boolean;
                mode: "merge" | "column" | "ignore";
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
            };
            url: string;
            budget: number;
            batchSize: number;
            id?: string | undefined;
            navigatorModel?: string | undefined;
            navigatorTemperature?: number | undefined;
            navigatorThinkingLevel?: "high" | "low" | "medium" | undefined;
            navigatorPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            navigatorSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            extractModel?: string | undefined;
            extractTemperature?: number | undefined;
            extractThinkingLevel?: "high" | "low" | "medium" | undefined;
            extractPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            extractSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            mergeModel?: string | undefined;
            mergeTemperature?: number | undefined;
            mergeThinkingLevel?: "high" | "low" | "medium" | undefined;
            mergePrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            mergeSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
        }, {
            schema: Record<string, any>;
            type: "website-agent";
            url: string;
            output?: {
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
                explode?: boolean | undefined;
                mode?: "merge" | "column" | "ignore" | undefined;
            } | undefined;
            id?: string | undefined;
            budget?: number | undefined;
            batchSize?: number | undefined;
            navigatorModel?: string | undefined;
            navigatorTemperature?: number | undefined;
            navigatorThinkingLevel?: "high" | "low" | "medium" | undefined;
            navigatorPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            navigatorSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            extractModel?: string | undefined;
            extractTemperature?: number | undefined;
            extractThinkingLevel?: "high" | "low" | "medium" | undefined;
            extractPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            extractSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            mergeModel?: string | undefined;
            mergeTemperature?: number | undefined;
            mergeThinkingLevel?: "high" | "low" | "medium" | undefined;
            mergePrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            mergeSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"style-scraper">;
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
            url: z.ZodEffects<z.ZodString, string, string>;
            resolution: z.ZodDefault<z.ZodString>;
            mobile: z.ZodDefault<z.ZodBoolean>;
            interactive: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            type: "style-scraper";
            output: {
                explode: boolean;
                mode: "merge" | "column" | "ignore";
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
            };
            resolution: string;
            url: string;
            mobile: boolean;
            interactive: boolean;
            id?: string | undefined;
        }, {
            type: "style-scraper";
            url: string;
            output?: {
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
                explode?: boolean | undefined;
                mode?: "merge" | "column" | "ignore" | undefined;
            } | undefined;
            resolution?: string | undefined;
            id?: string | undefined;
            mobile?: boolean | undefined;
            interactive?: boolean | undefined;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"validation">;
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
            schema: z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodAny>, Record<string, any>, Record<string, any>>;
            target: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        }, "strip", z.ZodTypeAny, {
            schema: Record<string, any>;
            type: "validation";
            output: {
                explode: boolean;
                mode: "merge" | "column" | "ignore";
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
            };
            id?: string | undefined;
            target?: string | undefined;
        }, {
            schema: Record<string, any>;
            type: "validation";
            output?: {
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
                explode?: boolean | undefined;
                mode?: "merge" | "column" | "ignore" | undefined;
            } | undefined;
            id?: string | undefined;
            target?: string | undefined;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"dedupe">;
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
            key: z.ZodEffects<z.ZodString, string, string>;
        }, "strip", z.ZodTypeAny, {
            type: "dedupe";
            output: {
                explode: boolean;
                mode: "merge" | "column" | "ignore";
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
            };
            key: string;
            id?: string | undefined;
        }, {
            type: "dedupe";
            key: string;
            output?: {
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
                explode?: boolean | undefined;
                mode?: "merge" | "column" | "ignore" | undefined;
            } | undefined;
            id?: string | undefined;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"logo-scraper">;
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
            url: z.ZodEffects<z.ZodString, string, string>;
            analyzeModel: z.ZodOptional<z.ZodString>;
            analyzeTemperature: z.ZodOptional<z.ZodNumber>;
            analyzeThinkingLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
            analyzePrompt: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
            analyzeSystem: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
            extractModel: z.ZodOptional<z.ZodString>;
            extractTemperature: z.ZodOptional<z.ZodNumber>;
            extractThinkingLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
            extractPrompt: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
            extractSystem: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
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
            maxCandidates: z.ZodDefault<z.ZodNumber>;
            minScore: z.ZodDefault<z.ZodNumber>;
            logoPath: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
            faviconPath: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
            logoLimit: z.ZodDefault<z.ZodNumber>;
            faviconLimit: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            type: "logo-scraper";
            output: {
                explode: boolean;
                mode: "merge" | "column" | "ignore";
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
            };
            url: string;
            maxCandidates: number;
            minScore: number;
            logoLimit: number;
            faviconLimit: number;
            id?: string | undefined;
            extractModel?: string | undefined;
            extractTemperature?: number | undefined;
            extractThinkingLevel?: "high" | "low" | "medium" | undefined;
            extractPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            extractSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            analyzeModel?: string | undefined;
            analyzeTemperature?: number | undefined;
            analyzeThinkingLevel?: "high" | "low" | "medium" | undefined;
            analyzePrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            analyzeSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            logoPath?: string | undefined;
            faviconPath?: string | undefined;
        }, {
            type: "logo-scraper";
            url: string;
            output?: {
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
                explode?: boolean | undefined;
                mode?: "merge" | "column" | "ignore" | undefined;
            } | undefined;
            id?: string | undefined;
            extractModel?: string | undefined;
            extractTemperature?: number | undefined;
            extractThinkingLevel?: "high" | "low" | "medium" | undefined;
            extractPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            extractSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            analyzeModel?: string | undefined;
            analyzeTemperature?: number | undefined;
            analyzeThinkingLevel?: "high" | "low" | "medium" | undefined;
            analyzePrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            analyzeSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            maxCandidates?: number | undefined;
            minScore?: number | undefined;
            logoPath?: string | undefined;
            faviconPath?: string | undefined;
            logoLimit?: number | undefined;
            faviconLimit?: number | undefined;
        }>]>, "many">>;
        preprocessors: z.ZodDefault<z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
            type: z.ZodLiteral<"url-expander">;
            mode: z.ZodDefault<z.ZodEnum<["fetch", "puppeteer"]>>;
            maxChars: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            type: "url-expander";
            mode: "fetch" | "puppeteer";
            maxChars: number;
        }, {
            type: "url-expander";
            mode?: "fetch" | "puppeteer" | undefined;
            maxChars?: number | undefined;
        }>]>, "many">>;
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
        outputPath: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        schema: z.ZodOptional<z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodAny>, Record<string, any>, Record<string, any>>>;
        candidates: z.ZodDefault<z.ZodNumber>;
        skipCandidateCommand: z.ZodDefault<z.ZodBoolean>;
        judge: z.ZodOptional<z.ZodObject<{
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
        }>>;
        feedback: z.ZodOptional<z.ZodObject<{
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
        } & {
            loops: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            loops: number;
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
            loops?: number | undefined;
        }>>;
        aspectRatio: z.ZodOptional<z.ZodString>;
        command: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        verifyCommand: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        timeout: z.ZodOptional<z.ZodNumber>;
    }, "skipCandidateCommand" | "command" | "verifyCommand">, "strip", z.ZodTypeAny, {
        output: {
            explode: boolean;
            mode: "merge" | "column" | "ignore";
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
        };
        plugins: ({
            type: "web-search";
            output: {
                explode: boolean;
                mode: "merge" | "column" | "ignore";
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
            };
            limit: number;
            mode: "html" | "markdown" | "none";
            queryCount: number;
            maxPages: number;
            dedupeStrategy: "none" | "url" | "domain";
            id?: string | undefined;
            gl?: string | undefined;
            hl?: string | undefined;
            query?: string | undefined;
            queryModel?: string | undefined;
            queryTemperature?: number | undefined;
            queryThinkingLevel?: "high" | "low" | "medium" | undefined;
            queryPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            querySystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            selectModel?: string | undefined;
            selectTemperature?: number | undefined;
            selectThinkingLevel?: "high" | "low" | "medium" | undefined;
            selectPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            selectSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            compressModel?: string | undefined;
            compressTemperature?: number | undefined;
            compressThinkingLevel?: "high" | "low" | "medium" | undefined;
            compressPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            compressSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
        } | {
            type: "image-search";
            output: {
                explode: boolean;
                mode: "merge" | "column" | "ignore";
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
            };
            select: number;
            limit: number;
            queryCount: number;
            maxPages: number;
            dedupeStrategy: "none" | "url" | "domain";
            spriteSize: number;
            id?: string | undefined;
            gl?: string | undefined;
            hl?: string | undefined;
            query?: string | undefined;
            queryModel?: string | undefined;
            queryTemperature?: number | undefined;
            queryThinkingLevel?: "high" | "low" | "medium" | undefined;
            queryPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            querySystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            selectModel?: string | undefined;
            selectTemperature?: number | undefined;
            selectThinkingLevel?: "high" | "low" | "medium" | undefined;
            selectPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            selectSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
        } | {
            schema: Record<string, any>;
            type: "website-agent";
            output: {
                explode: boolean;
                mode: "merge" | "column" | "ignore";
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
            };
            url: string;
            budget: number;
            batchSize: number;
            id?: string | undefined;
            navigatorModel?: string | undefined;
            navigatorTemperature?: number | undefined;
            navigatorThinkingLevel?: "high" | "low" | "medium" | undefined;
            navigatorPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            navigatorSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            extractModel?: string | undefined;
            extractTemperature?: number | undefined;
            extractThinkingLevel?: "high" | "low" | "medium" | undefined;
            extractPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            extractSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            mergeModel?: string | undefined;
            mergeTemperature?: number | undefined;
            mergeThinkingLevel?: "high" | "low" | "medium" | undefined;
            mergePrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            mergeSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
        } | {
            type: "style-scraper";
            output: {
                explode: boolean;
                mode: "merge" | "column" | "ignore";
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
            };
            resolution: string;
            url: string;
            mobile: boolean;
            interactive: boolean;
            id?: string | undefined;
        } | {
            schema: Record<string, any>;
            type: "validation";
            output: {
                explode: boolean;
                mode: "merge" | "column" | "ignore";
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
            };
            id?: string | undefined;
            target?: string | undefined;
        } | {
            type: "dedupe";
            output: {
                explode: boolean;
                mode: "merge" | "column" | "ignore";
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
            };
            key: string;
            id?: string | undefined;
        } | {
            type: "logo-scraper";
            output: {
                explode: boolean;
                mode: "merge" | "column" | "ignore";
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
            };
            url: string;
            maxCandidates: number;
            minScore: number;
            logoLimit: number;
            faviconLimit: number;
            id?: string | undefined;
            extractModel?: string | undefined;
            extractTemperature?: number | undefined;
            extractThinkingLevel?: "high" | "low" | "medium" | undefined;
            extractPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            extractSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            analyzeModel?: string | undefined;
            analyzeTemperature?: number | undefined;
            analyzeThinkingLevel?: "high" | "low" | "medium" | undefined;
            analyzePrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            analyzeSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            logoPath?: string | undefined;
            faviconPath?: string | undefined;
        })[];
        preprocessors: {
            type: "url-expander";
            mode: "fetch" | "puppeteer";
            maxChars: number;
        }[];
        candidates: number;
        schema?: Record<string, any> | undefined;
        feedback?: {
            loops: number;
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
        } | undefined;
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
        model?: {
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
        } | undefined;
        outputPath?: string | undefined;
        judge?: {
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
        } | undefined;
        aspectRatio?: string | undefined;
        timeout?: number | undefined;
    }, {
        schema?: Record<string, any> | undefined;
        feedback?: {
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
            loops?: number | undefined;
        } | undefined;
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
        output?: {
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
            explode?: boolean | undefined;
            mode?: "merge" | "column" | "ignore" | undefined;
        } | undefined;
        model?: {
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
        } | undefined;
        plugins?: ({
            type: "web-search";
            output?: {
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
                explode?: boolean | undefined;
                mode?: "merge" | "column" | "ignore" | undefined;
            } | undefined;
            id?: string | undefined;
            limit?: number | undefined;
            gl?: string | undefined;
            hl?: string | undefined;
            mode?: "html" | "markdown" | "none" | undefined;
            query?: string | undefined;
            queryModel?: string | undefined;
            queryTemperature?: number | undefined;
            queryThinkingLevel?: "high" | "low" | "medium" | undefined;
            queryPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            querySystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            selectModel?: string | undefined;
            selectTemperature?: number | undefined;
            selectThinkingLevel?: "high" | "low" | "medium" | undefined;
            selectPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            selectSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            compressModel?: string | undefined;
            compressTemperature?: number | undefined;
            compressThinkingLevel?: "high" | "low" | "medium" | undefined;
            compressPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            compressSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            queryCount?: number | undefined;
            maxPages?: number | undefined;
            dedupeStrategy?: "none" | "url" | "domain" | undefined;
        } | {
            type: "image-search";
            output?: {
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
                explode?: boolean | undefined;
                mode?: "merge" | "column" | "ignore" | undefined;
            } | undefined;
            select?: number | undefined;
            id?: string | undefined;
            limit?: number | undefined;
            gl?: string | undefined;
            hl?: string | undefined;
            query?: string | undefined;
            queryModel?: string | undefined;
            queryTemperature?: number | undefined;
            queryThinkingLevel?: "high" | "low" | "medium" | undefined;
            queryPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            querySystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            selectModel?: string | undefined;
            selectTemperature?: number | undefined;
            selectThinkingLevel?: "high" | "low" | "medium" | undefined;
            selectPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            selectSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            queryCount?: number | undefined;
            maxPages?: number | undefined;
            dedupeStrategy?: "none" | "url" | "domain" | undefined;
            spriteSize?: number | undefined;
        } | {
            schema: Record<string, any>;
            type: "website-agent";
            url: string;
            output?: {
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
                explode?: boolean | undefined;
                mode?: "merge" | "column" | "ignore" | undefined;
            } | undefined;
            id?: string | undefined;
            budget?: number | undefined;
            batchSize?: number | undefined;
            navigatorModel?: string | undefined;
            navigatorTemperature?: number | undefined;
            navigatorThinkingLevel?: "high" | "low" | "medium" | undefined;
            navigatorPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            navigatorSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            extractModel?: string | undefined;
            extractTemperature?: number | undefined;
            extractThinkingLevel?: "high" | "low" | "medium" | undefined;
            extractPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            extractSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            mergeModel?: string | undefined;
            mergeTemperature?: number | undefined;
            mergeThinkingLevel?: "high" | "low" | "medium" | undefined;
            mergePrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            mergeSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
        } | {
            type: "style-scraper";
            url: string;
            output?: {
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
                explode?: boolean | undefined;
                mode?: "merge" | "column" | "ignore" | undefined;
            } | undefined;
            resolution?: string | undefined;
            id?: string | undefined;
            mobile?: boolean | undefined;
            interactive?: boolean | undefined;
        } | {
            schema: Record<string, any>;
            type: "validation";
            output?: {
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
                explode?: boolean | undefined;
                mode?: "merge" | "column" | "ignore" | undefined;
            } | undefined;
            id?: string | undefined;
            target?: string | undefined;
        } | {
            type: "dedupe";
            key: string;
            output?: {
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
                explode?: boolean | undefined;
                mode?: "merge" | "column" | "ignore" | undefined;
            } | undefined;
            id?: string | undefined;
        } | {
            type: "logo-scraper";
            url: string;
            output?: {
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
                explode?: boolean | undefined;
                mode?: "merge" | "column" | "ignore" | undefined;
            } | undefined;
            id?: string | undefined;
            extractModel?: string | undefined;
            extractTemperature?: number | undefined;
            extractThinkingLevel?: "high" | "low" | "medium" | undefined;
            extractPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            extractSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            analyzeModel?: string | undefined;
            analyzeTemperature?: number | undefined;
            analyzeThinkingLevel?: "high" | "low" | "medium" | undefined;
            analyzePrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            analyzeSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            maxCandidates?: number | undefined;
            minScore?: number | undefined;
            logoPath?: string | undefined;
            faviconPath?: string | undefined;
            logoLimit?: number | undefined;
            faviconLimit?: number | undefined;
        })[] | undefined;
        preprocessors?: {
            type: "url-expander";
            mode?: "fetch" | "puppeteer" | undefined;
            maxChars?: number | undefined;
        }[] | undefined;
        outputPath?: string | undefined;
        candidates?: number | undefined;
        judge?: {
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
        } | undefined;
        aspectRatio?: string | undefined;
        timeout?: number | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    data: {
        format: "json" | "auto" | "csv";
        rows: Record<string, any>[];
        offset?: number | undefined;
        limit?: number | undefined;
    };
    steps: {
        output: {
            explode: boolean;
            mode: "merge" | "column" | "ignore";
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
        };
        plugins: ({
            type: "web-search";
            output: {
                explode: boolean;
                mode: "merge" | "column" | "ignore";
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
            };
            limit: number;
            mode: "html" | "markdown" | "none";
            queryCount: number;
            maxPages: number;
            dedupeStrategy: "none" | "url" | "domain";
            id?: string | undefined;
            gl?: string | undefined;
            hl?: string | undefined;
            query?: string | undefined;
            queryModel?: string | undefined;
            queryTemperature?: number | undefined;
            queryThinkingLevel?: "high" | "low" | "medium" | undefined;
            queryPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            querySystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            selectModel?: string | undefined;
            selectTemperature?: number | undefined;
            selectThinkingLevel?: "high" | "low" | "medium" | undefined;
            selectPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            selectSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            compressModel?: string | undefined;
            compressTemperature?: number | undefined;
            compressThinkingLevel?: "high" | "low" | "medium" | undefined;
            compressPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            compressSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
        } | {
            type: "image-search";
            output: {
                explode: boolean;
                mode: "merge" | "column" | "ignore";
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
            };
            select: number;
            limit: number;
            queryCount: number;
            maxPages: number;
            dedupeStrategy: "none" | "url" | "domain";
            spriteSize: number;
            id?: string | undefined;
            gl?: string | undefined;
            hl?: string | undefined;
            query?: string | undefined;
            queryModel?: string | undefined;
            queryTemperature?: number | undefined;
            queryThinkingLevel?: "high" | "low" | "medium" | undefined;
            queryPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            querySystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            selectModel?: string | undefined;
            selectTemperature?: number | undefined;
            selectThinkingLevel?: "high" | "low" | "medium" | undefined;
            selectPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            selectSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
        } | {
            schema: Record<string, any>;
            type: "website-agent";
            output: {
                explode: boolean;
                mode: "merge" | "column" | "ignore";
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
            };
            url: string;
            budget: number;
            batchSize: number;
            id?: string | undefined;
            navigatorModel?: string | undefined;
            navigatorTemperature?: number | undefined;
            navigatorThinkingLevel?: "high" | "low" | "medium" | undefined;
            navigatorPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            navigatorSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            extractModel?: string | undefined;
            extractTemperature?: number | undefined;
            extractThinkingLevel?: "high" | "low" | "medium" | undefined;
            extractPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            extractSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            mergeModel?: string | undefined;
            mergeTemperature?: number | undefined;
            mergeThinkingLevel?: "high" | "low" | "medium" | undefined;
            mergePrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            mergeSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
        } | {
            type: "style-scraper";
            output: {
                explode: boolean;
                mode: "merge" | "column" | "ignore";
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
            };
            resolution: string;
            url: string;
            mobile: boolean;
            interactive: boolean;
            id?: string | undefined;
        } | {
            schema: Record<string, any>;
            type: "validation";
            output: {
                explode: boolean;
                mode: "merge" | "column" | "ignore";
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
            };
            id?: string | undefined;
            target?: string | undefined;
        } | {
            type: "dedupe";
            output: {
                explode: boolean;
                mode: "merge" | "column" | "ignore";
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
            };
            key: string;
            id?: string | undefined;
        } | {
            type: "logo-scraper";
            output: {
                explode: boolean;
                mode: "merge" | "column" | "ignore";
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
            };
            url: string;
            maxCandidates: number;
            minScore: number;
            logoLimit: number;
            faviconLimit: number;
            id?: string | undefined;
            extractModel?: string | undefined;
            extractTemperature?: number | undefined;
            extractThinkingLevel?: "high" | "low" | "medium" | undefined;
            extractPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            extractSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            analyzeModel?: string | undefined;
            analyzeTemperature?: number | undefined;
            analyzeThinkingLevel?: "high" | "low" | "medium" | undefined;
            analyzePrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            analyzeSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            logoPath?: string | undefined;
            faviconPath?: string | undefined;
        })[];
        preprocessors: {
            type: "url-expander";
            mode: "fetch" | "puppeteer";
            maxChars: number;
        }[];
        candidates: number;
        schema?: Record<string, any> | undefined;
        feedback?: {
            loops: number;
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
        } | undefined;
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
        model?: {
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
        } | undefined;
        outputPath?: string | undefined;
        judge?: {
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
        } | undefined;
        aspectRatio?: string | undefined;
        timeout?: number | undefined;
    }[];
    globals: {
        model: string;
        concurrency: number;
        taskConcurrency: number;
        timeout: number;
        tmpDir: string;
        offset?: number | undefined;
        limit?: number | undefined;
        temperature?: number | undefined;
        thinkingLevel?: "high" | "low" | "medium" | undefined;
        outputPath?: string | undefined;
        dataOutputPath?: string | undefined;
        inputLimit?: number | undefined;
        inputOffset?: number | undefined;
    };
}, {
    steps: {
        schema?: Record<string, any> | undefined;
        feedback?: {
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
            loops?: number | undefined;
        } | undefined;
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
        output?: {
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
            explode?: boolean | undefined;
            mode?: "merge" | "column" | "ignore" | undefined;
        } | undefined;
        model?: {
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
        } | undefined;
        plugins?: ({
            type: "web-search";
            output?: {
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
                explode?: boolean | undefined;
                mode?: "merge" | "column" | "ignore" | undefined;
            } | undefined;
            id?: string | undefined;
            limit?: number | undefined;
            gl?: string | undefined;
            hl?: string | undefined;
            mode?: "html" | "markdown" | "none" | undefined;
            query?: string | undefined;
            queryModel?: string | undefined;
            queryTemperature?: number | undefined;
            queryThinkingLevel?: "high" | "low" | "medium" | undefined;
            queryPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            querySystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            selectModel?: string | undefined;
            selectTemperature?: number | undefined;
            selectThinkingLevel?: "high" | "low" | "medium" | undefined;
            selectPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            selectSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            compressModel?: string | undefined;
            compressTemperature?: number | undefined;
            compressThinkingLevel?: "high" | "low" | "medium" | undefined;
            compressPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            compressSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            queryCount?: number | undefined;
            maxPages?: number | undefined;
            dedupeStrategy?: "none" | "url" | "domain" | undefined;
        } | {
            type: "image-search";
            output?: {
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
                explode?: boolean | undefined;
                mode?: "merge" | "column" | "ignore" | undefined;
            } | undefined;
            select?: number | undefined;
            id?: string | undefined;
            limit?: number | undefined;
            gl?: string | undefined;
            hl?: string | undefined;
            query?: string | undefined;
            queryModel?: string | undefined;
            queryTemperature?: number | undefined;
            queryThinkingLevel?: "high" | "low" | "medium" | undefined;
            queryPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            querySystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            selectModel?: string | undefined;
            selectTemperature?: number | undefined;
            selectThinkingLevel?: "high" | "low" | "medium" | undefined;
            selectPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            selectSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            queryCount?: number | undefined;
            maxPages?: number | undefined;
            dedupeStrategy?: "none" | "url" | "domain" | undefined;
            spriteSize?: number | undefined;
        } | {
            schema: Record<string, any>;
            type: "website-agent";
            url: string;
            output?: {
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
                explode?: boolean | undefined;
                mode?: "merge" | "column" | "ignore" | undefined;
            } | undefined;
            id?: string | undefined;
            budget?: number | undefined;
            batchSize?: number | undefined;
            navigatorModel?: string | undefined;
            navigatorTemperature?: number | undefined;
            navigatorThinkingLevel?: "high" | "low" | "medium" | undefined;
            navigatorPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            navigatorSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            extractModel?: string | undefined;
            extractTemperature?: number | undefined;
            extractThinkingLevel?: "high" | "low" | "medium" | undefined;
            extractPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            extractSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            mergeModel?: string | undefined;
            mergeTemperature?: number | undefined;
            mergeThinkingLevel?: "high" | "low" | "medium" | undefined;
            mergePrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            mergeSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
        } | {
            type: "style-scraper";
            url: string;
            output?: {
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
                explode?: boolean | undefined;
                mode?: "merge" | "column" | "ignore" | undefined;
            } | undefined;
            resolution?: string | undefined;
            id?: string | undefined;
            mobile?: boolean | undefined;
            interactive?: boolean | undefined;
        } | {
            schema: Record<string, any>;
            type: "validation";
            output?: {
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
                explode?: boolean | undefined;
                mode?: "merge" | "column" | "ignore" | undefined;
            } | undefined;
            id?: string | undefined;
            target?: string | undefined;
        } | {
            type: "dedupe";
            key: string;
            output?: {
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
                explode?: boolean | undefined;
                mode?: "merge" | "column" | "ignore" | undefined;
            } | undefined;
            id?: string | undefined;
        } | {
            type: "logo-scraper";
            url: string;
            output?: {
                offset?: number | undefined;
                column?: string | undefined;
                limit?: number | undefined;
                explode?: boolean | undefined;
                mode?: "merge" | "column" | "ignore" | undefined;
            } | undefined;
            id?: string | undefined;
            extractModel?: string | undefined;
            extractTemperature?: number | undefined;
            extractThinkingLevel?: "high" | "low" | "medium" | undefined;
            extractPrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            extractSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            analyzeModel?: string | undefined;
            analyzeTemperature?: number | undefined;
            analyzeThinkingLevel?: "high" | "low" | "medium" | undefined;
            analyzePrompt?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            analyzeSystem?: string | {
                text?: string | undefined;
                file?: string | undefined;
                parts?: {
                    type: "text" | "image" | "audio";
                    content: string;
                }[] | undefined;
            } | undefined;
            maxCandidates?: number | undefined;
            minScore?: number | undefined;
            logoPath?: string | undefined;
            faviconPath?: string | undefined;
            logoLimit?: number | undefined;
            faviconLimit?: number | undefined;
        })[] | undefined;
        preprocessors?: {
            type: "url-expander";
            mode?: "fetch" | "puppeteer" | undefined;
            maxChars?: number | undefined;
        }[] | undefined;
        outputPath?: string | undefined;
        candidates?: number | undefined;
        judge?: {
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
        } | undefined;
        aspectRatio?: string | undefined;
        timeout?: number | undefined;
    }[];
    data?: {
        offset?: number | undefined;
        limit?: number | undefined;
        format?: "json" | "auto" | "csv" | undefined;
        rows?: Record<string, any>[] | undefined;
    } | undefined;
    globals?: {
        offset?: number | undefined;
        model?: string | undefined;
        concurrency?: number | undefined;
        taskConcurrency?: number | undefined;
        limit?: number | undefined;
        temperature?: number | undefined;
        thinkingLevel?: "high" | "low" | "medium" | undefined;
        outputPath?: string | undefined;
        timeout?: number | undefined;
        tmpDir?: string | undefined;
        dataOutputPath?: string | undefined;
        inputLimit?: number | undefined;
        inputOffset?: number | undefined;
    } | undefined;
}>;
export type SafePipelineConfig = z.infer<typeof SafePipelineConfigSchema>;
//# sourceMappingURL=safeSchema.d.ts.map