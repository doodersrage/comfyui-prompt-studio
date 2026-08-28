'use client';

import { useVariationGridInit } from '@/hooks/variation-grid/useVariationGridInit';
import { useVariationGridRoll } from '@/hooks/variation-grid/useVariationGridRoll';
import { useVariationGridQueue } from '@/hooks/variation-grid/useVariationGridQueue';

export function useVariationGridOrchestration() {
  const init = useVariationGridInit();
  const { rollGrid, rollMatrix } = useVariationGridRoll(init);
  const { executeQueue, queueGrid } = useVariationGridQueue(init);

  return {
    mounted: init.mounted,
    isSimple: init.isSimple,
    shared: init.shared,
    toolSettings: init.toolSettings,
    updateShared: init.updateShared,
    updateToolSettings: init.updateToolSettings,
    results: init.results,
    setResults: init.setResults,
    loading: init.loading,
    queueLoading: init.queueLoading,
    error: init.error,
    status: init.status,
    comfyStatus: init.comfyStatus,
    importStatus: init.importStatus,
    setImportStatus: init.setImportStatus,
    lintSummary: init.lintSummary,
    setLintSummary: init.setLintSummary,
    lintLoading: init.lintLoading,
    readyOnly: init.readyOnly,
    setReadyOnly: init.setReadyOnly,
    queueProgress: init.queueProgress,
    rollProgress: init.rollProgress,
    target: init.target,
    hintSource: init.hintSource,
    historySeedScope: init.historySeedScope,
    historyTool: init.historyTool,
    historyCandidateCount: init.historyCandidateCount,
    gridMode: init.gridMode,
    count: init.count,
    matrixRowCount: init.matrixRowCount,
    matrixColCount: init.matrixColCount,
    matrixAxisRow: init.matrixAxisRow,
    matrixAxisCol: init.matrixAxisCol,
    readinessByIndex: init.readinessByIndex,
    rollGrid,
    rollMatrix,
    executeQueue,
    queueGrid,
  };
}
