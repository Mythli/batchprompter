import { z } from 'zod';
import { Plugin, PluginExecutionContext, PluginResult, CLIOptionDefinition } from '../types.js';
import { ServiceCapabilities, ResolvedModelConfig, ResolvedOutputConfig } from '../../config/types.js';
import { ContentResolver } from '../../core/io/ContentResolver.js';
export declare const WebSearchConfigSchemaV2: z.ZodObject<{
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
}>;
export type WebSearchRawConfigV2 = z.infer<typeof WebSearchConfigSchemaV2>;
export interface WebSearchResolvedConfigV2 {
    type: 'web-search';
    id: string;
    output: ResolvedOutputConfig;
    query?: string;
    queryModel?: ResolvedModelConfig;
    selectModel?: ResolvedModelConfig;
    compressModel?: ResolvedModelConfig;
    limit: number;
    mode: 'none' | 'markdown' | 'html';
    queryCount: number;
    maxPages: number;
    dedupeStrategy: 'none' | 'domain' | 'url';
    gl?: string;
    hl?: string;
}
export declare class WebSearchPluginV2 implements Plugin<WebSearchRawConfigV2, WebSearchResolvedConfigV2> {
    readonly type = "web-search";
    readonly configSchema: z.ZodObject<{
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
    }>;
    readonly cliOptions: CLIOptionDefinition[];
    getRequiredCapabilities(): (keyof ServiceCapabilities)[];
    parseCLIOptions(options: Record<string, any>, stepIndex: number): WebSearchRawConfigV2 | null;
    resolveConfig(rawConfig: WebSearchRawConfigV2, row: Record<string, any>, inheritedModel: {
        model: string;
        temperature?: number;
        thinkingLevel?: 'low' | 'medium' | 'high';
    }, contentResolver: ContentResolver): Promise<WebSearchResolvedConfigV2>;
    execute(config: WebSearchResolvedConfigV2, context: PluginExecutionContext): Promise<PluginResult>;
}
//# sourceMappingURL=WebSearchPluginV2.d.ts.map