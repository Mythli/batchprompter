import { z } from 'zod';
import { WebSearchConfigSchemaV2 } from '../plugins/web-search/WebSearchPluginV2.js';
import { ImageSearchConfigSchemaV2 } from '../plugins/image-search/ImageSearchPluginV2.js';
import { WebsiteAgentConfigSchemaV2, LooseWebsiteAgentConfigSchemaV2 } from '../plugins/website-agent/WebsiteAgentPluginV2.js';
import { StyleScraperConfigSchemaV2 } from '../plugins/style-scraper/StyleScraperPluginV2.js';
import { ValidationConfigSchemaV2, LooseValidationConfigSchemaV2 } from '../plugins/validation/ValidationPluginV2.js';
import { DedupeConfigSchemaV2 } from '../plugins/dedupe/DedupePluginV2.js';
import { LogoScraperConfigSchemaV2 } from '../plugins/logo-scraper/LogoScraperPluginV2.js';

/**
 * Strict Union (Runtime / Generation)
 */
export const PluginUnionSchema = z.discriminatedUnion('type', [
    WebSearchConfigSchemaV2,
    ImageSearchConfigSchemaV2,
    WebsiteAgentConfigSchemaV2,
    StyleScraperConfigSchemaV2,
    ValidationConfigSchemaV2,
    DedupeConfigSchemaV2,
    LogoScraperConfigSchemaV2
]);

/**
 * Loose Union (Input / CLI)
 */
export const LoosePluginUnionSchema = z.discriminatedUnion('type', [
    WebSearchConfigSchemaV2,
    ImageSearchConfigSchemaV2,
    LooseWebsiteAgentConfigSchemaV2,
    StyleScraperConfigSchemaV2,
    LooseValidationConfigSchemaV2,
    DedupeConfigSchemaV2,
    LogoScraperConfigSchemaV2
]);

export type PluginConfig = z.infer<typeof PluginUnionSchema>;
