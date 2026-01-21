Purpose of Batchprompt: Batchprompt is a batch processing pipeline framework for LLM operations. It enables users to define multi-step pipelines that process 
rows of data through configurable steps, each potentially involving LLM calls, plugins (web search, image search, URL expansion, website crawling, logo       
scraping), and output transformations. Key features include row explosion (one input row producing many output rows), candidate generation with judge         
selection (generate N responses, have another LLM pick the best), schema validation with retry logic, and artifact handling for saving generated files/images.
The framework manages concurrency, caching, and event-driven debugging/logging throughout the pipeline execution.                                             

The Refactor That Was Done: The major refactor restructured how model configuration and plugin execution work. Model configuration moved from flat step-level 
properties (model: "gpt-4", prompt: "...") to a nested object structure (model: { model: "gpt-4", prompt: "..." }) that gets transformed into proper OpenAI   
message arrays at parse time. The Pipeline constructor now accepts three arguments (deps, steps, globalConfig) with Steps being pre-created instances. The    
plugin system was unified around a BasePlugin + BasePluginRow pattern where plugins implement createRow() to return per-row execution instances with prepare()
and postProcess() hooks. StepRow became the central orchestrator for row-level processing, handling message preparation, LLM execution via strategies         
(StandardStrategy, CandidateStrategy), and result application including explosion/merge logic.                                                                

What Is Still Missing: Several plugins remain disabled and need migration to the new BasePluginRow architecture: ImageSearchPluginV2, WebsiteAgentPluginV2,   
StyleScraperPluginV2, ValidationPluginV2, DedupePluginV2, and LogoScraperPluginV2—all marked with TODO comments. Image artifact handling in StandardStrategy  
is incomplete (the imagegen.test.ts is skipped). Additionally, some tests reference the old flat model config format instead of the new nested object 
structure, causing schema validation failures during test runs.    
