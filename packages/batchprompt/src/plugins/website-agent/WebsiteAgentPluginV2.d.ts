import { z } from 'zod';
import { Plugin, PluginExecutionContext, PluginResult, CLIOptionDefinition } from '../types.js';
import { ServiceCapabilities, ResolvedModelConfig, ResolvedOutputConfig } from '../../config/types.js';
import { ContentResolver } from '../../core/io/ContentResolver.js';
export declare const WebsiteAgentConfigSchemaV2: z.ZodObject<{
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
}>;
export declare const LooseWebsiteAgentConfigSchemaV2: z.ZodObject<{
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
} & {
    schema: z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodAny>, Record<string, any>, Record<string, any>>]>;
}, "strip", z.ZodTypeAny, {
    schema: string | Record<string, any>;
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
    schema: string | Record<string, any>;
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
}>;
export type WebsiteAgentRawConfigV2 = z.infer<typeof LooseWebsiteAgentConfigSchemaV2>;
export interface WebsiteAgentResolvedConfigV2 {
    type: 'website-agent';
    id: string;
    output: ResolvedOutputConfig;
    url: string;
    schema: any;
    extractionSchema: any;
    budget: number;
    batchSize: number;
    navigatorModel: ResolvedModelConfig;
    extractModel: ResolvedModelConfig;
    mergeModel: ResolvedModelConfig;
}
export declare class WebsiteAgentPluginV2 implements Plugin<WebsiteAgentRawConfigV2, WebsiteAgentResolvedConfigV2> {
    readonly type = "website-agent";
    readonly configSchema: z.ZodObject<{
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
    } & {
        schema: z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodAny>, Record<string, any>, Record<string, any>>]>;
    }, "strip", z.ZodTypeAny, {
        schema: string | Record<string, any>;
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
        schema: string | Record<string, any>;
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
    }>;
    readonly cliOptions: CLIOptionDefinition[];
    getRequiredCapabilities(): (keyof ServiceCapabilities)[];
    parseCLIOptions(options: Record<string, any>, stepIndex: number): WebsiteAgentRawConfigV2 | null;
    normalizeConfig(config: WebsiteAgentRawConfigV2, contentResolver: ContentResolver): Promise<WebsiteAgentRawConfigV2>;
    resolveConfig(rawConfig: WebsiteAgentRawConfigV2, row: Record<string, any>, inheritedModel: {
        model: string;
        temperature?: number;
        thinkingLevel?: 'low' | 'medium' | 'high';
    }, contentResolver: ContentResolver): Promise<WebsiteAgentResolvedConfigV2>;
    execute(config: WebsiteAgentResolvedConfigV2, context: PluginExecutionContext): Promise<PluginResult>;
}
//# sourceMappingURL=WebsiteAgentPluginV2.d.ts.map