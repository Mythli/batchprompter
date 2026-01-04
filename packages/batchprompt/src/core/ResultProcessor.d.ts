import { OutputStrategy, PipelineItem } from '../../types.js';
import { PluginPacket } from '../plugins/types.js';
export declare class ResultProcessor {
    /**
     * Applies a result (from a plugin or model) to the current list of PipelineItems.
     *
     * 1. Handles flow control (Filter/Enrich/Explode) based on the result packets.
     * 2. Updates `item.workspace[namespace]` and `item.accumulatedContent`.
     * 3. Conditionally updates `item.row` based on the OutputStrategy.
     */
    static process(currentItems: PipelineItem[], packets: PluginPacket[], strategy: OutputStrategy, namespace: string): PipelineItem[];
    private static cloneItem;
    private static updateRow;
}
//# sourceMappingURL=ResultProcessor.d.ts.map