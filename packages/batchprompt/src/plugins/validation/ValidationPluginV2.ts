// TODO: Migrate to new plugin architecture (BasePluginRow pattern)
// This plugin is currently disabled and needs refactoring

export {};

// Original implementation commented out for reference during migration:
/*
import { z } from 'zod';
import Handlebars from 'handlebars';
import Ajv from 'ajv';
import { EventEmitter } from 'eventemitter3';
import {
    BasePlugin,
} from '../types.js';
import { StepRow } from '../../StepRow.js';
import { OutputConfigSchema, DEFAULT_PLUGIN_OUTPUT, zJsonSchemaObject, zHandlebars } from '../../config/index.js';
import { PluginScope } from '../PluginScope.js';
import { renderSchemaObject } from '../../utils/schemaUtils.js';

// Plugin implementation needs migration to createRow() pattern
*/
