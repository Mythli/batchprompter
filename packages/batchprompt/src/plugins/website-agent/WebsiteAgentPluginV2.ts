// TODO: Migrate to new plugin architecture (BasePluginRow pattern)
// This plugin is currently disabled and needs refactoring

export {};

// Original implementation commented out for reference during migration:
/*
import { z } from 'zod';
import Handlebars from 'handlebars';
import OpenAI from 'openai';
import {
    BasePlugin,
} from '../types.js';
import { StepRow } from '../../StepRow.js';
import { OutputConfigSchema, DEFAULT_PLUGIN_OUTPUT, zJsonSchemaObject, zHandlebars } from '../../config/index.js';
import { makeSchemaOptional, renderSchemaObject } from '../../utils/schemaUtils.js';
import { AiWebsiteAgent } from './AiWebsiteAgent.js';
import { PluginScope } from '../PluginScope.js';
import { PuppeteerHelper } from '../../utils/puppeteer/PuppeteerHelper.js';
import PQueue from 'p-queue';

// Plugin implementation needs migration to createRow() pattern
*/
