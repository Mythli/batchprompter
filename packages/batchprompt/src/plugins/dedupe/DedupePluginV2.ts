// TODO: Migrate to new plugin architecture (BasePluginRow pattern)
// This plugin is currently disabled and needs refactoring

export {};

// Original implementation commented out for reference during migration:
/*
import { z } from 'zod';
import Handlebars from 'handlebars';
import { EventEmitter } from 'eventemitter3';
import {
    BasePlugin,
} from '../types.js';
import { StepRow } from '../../StepRow.js';
import { PluginScope } from '../PluginScope.js';
import { zHandlebars } from "../../config/validationRules.js";
import { OutputConfigSchema } from "../../config/schema.js";
import { DEFAULT_PLUGIN_OUTPUT } from "../../config/index.js";

export const DedupeConfigSchemaV2 = z.object({
    type: z.literal('dedupe'),
    id: z.string().optional(),
    output: OutputConfigSchema.default(DEFAULT_PLUGIN_OUTPUT),
    key: zHandlebars
}).strict();

export type DedupeConfig = z.output<typeof DedupeConfigSchemaV2>;

// Plugin implementation needs migration to createRow() pattern
*/
