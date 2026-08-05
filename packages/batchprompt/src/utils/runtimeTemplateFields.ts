export function getRowUid(originalIndex: number, lineage: number[]): string {
    const branch = lineage.length > 0 ? `v${lineage.join('-')}` : 'root';
    return `row-${originalIndex}-${branch}`;
}

export function withRuntimeTemplateFields(
    context: Record<string, any>,
    originalIndex: number,
    lineage: number[]
): Record<string, any> {
    return {
        ...context,
        _row_uid: getRowUid(originalIndex, lineage),
        _row_index: String(originalIndex)
    };
}
