import { z } from 'zod';
import { Plugin, PluginExecutionContext, PluginResult, CLIOptionDefinition } from '../types.js';
import { ServiceCapabilities, ResolvedModelConfig, ResolvedOutputConfig } from '../../config/types.js';
import { ContentResolver } from '../../core/io/ContentResolver.js';
export declare const ImageSearchConfigSchemaV2: z.ZodObject<{
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
}>;
export type ImageSearchRawConfigV2 = z.infer<typeof ImageSearchConfigSchemaV2>;
export interface ImageSearchResolvedConfigV2 {
    type: 'image-search';
    id: string;
    output: ResolvedOutputConfig;
    query?: string;
    queryModel?: ResolvedModelConfig;
    selectModel?: ResolvedModelConfig;
    limit: number;
    select: number;
    queryCount: number;
    spriteSize: number;
    maxPages: number;
    dedupeStrategy: 'none' | 'domain' | 'url';
    gl?: string;
    hl?: string;
}
export declare class ImageSearchPluginV2 implements Plugin<ImageSearchRawConfigV2, ImageSearchResolvedConfigV2> {
    readonly type = "image-search";
    readonly configSchema: z.ZodObject<{
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
    }>;
    readonly cliOptions: CLIOptionDefinition[];
    getRequiredCapabilities(): (keyof ServiceCapabilities)[];
    parseCLIOptions(options: Record<string, any>, stepIndex: number): ImageSearchRawConfigV2 | null;
    resolveConfig(rawConfig: ImageSearchRawConfigV2, row: Record<string, any>, inheritedModel: {
        model: string;
        temperature?: number;
        thinkingLevel?: 'low' | 'medium' | 'high';
    }, contentResolver: ContentResolver): Promise<ImageSearchResolvedConfigV2>;
    execute(config: ImageSearchResolvedConfigV2, context: PluginExecutionContext): Promise<PluginResult>;
}
//# sourceMappingURL=ImageSearchPluginV2.d.ts.map