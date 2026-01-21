// TODO: Migrate to new plugin architecture (BasePluginRow pattern)
// This plugin is currently disabled and needs refactoring

export {};

// Original implementation commented out for reference during migration:
/*
import { z } from 'zod';
import Handlebars from 'handlebars';
import {
    BasePlugin,
} from '../types.js';
import { StepRow } from '../../StepRow.js';
import { OutputConfigSchema, DEFAULT_PLUGIN_OUTPUT, resolveModelConfig } from '../../config/index.js';
import { AiImageSearch } from './AiImageSearch.js';
import { LlmListSelector } from '../../utils/LlmListSelector.js';
import { ImageSearch } from './ImageSearch.js';

// Plugin implementation needs migration to createRow() pattern
*/
