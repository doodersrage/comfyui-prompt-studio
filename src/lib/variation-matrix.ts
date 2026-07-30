import { sportPresetsForMode } from './sport-presets';

export type MatrixAxisKind = 'variation' | 'sportPreset' | 'location';

export type MatrixCell = {
  row: number;
  col: number;
  rowLabel: string;
  colLabel: string;
  variationStrength?: number;
  sportPresetId?: string;
  lockedLocation?: string;
};

export function buildMatrixAxes(input: {
  axisRow: MatrixAxisKind;
  axisCol: MatrixAxisKind;
  rowCount: number;
  colCount: number;
  baseVariation?: number;
  recentLocations?: string[];
}): MatrixCell[] {
  const rowCount = Math.min(6, Math.max(2, input.rowCount));
  const colCount = Math.min(6, Math.max(2, input.colCount));
  const cells: MatrixCell[] = [];

  const rowValues = axisValues(input.axisRow, rowCount, input);
  const colValues = axisValues(input.axisCol, colCount, input);

  for (let row = 0; row < rowValues.length; row += 1) {
    for (let col = 0; col < colValues.length; col += 1) {
      cells.push({
        row,
        col,
        rowLabel: rowValues[row].label,
        colLabel: colValues[col].label,
        variationStrength: rowValues[row].variationStrength ?? colValues[col].variationStrength,
        sportPresetId: rowValues[row].sportPresetId ?? colValues[col].sportPresetId,
        lockedLocation: rowValues[row].lockedLocation ?? colValues[col].lockedLocation,
      });
    }
  }

  return cells;
}

function axisValues(
  axis: MatrixAxisKind,
  count: number,
  input: {
    baseVariation?: number;
    recentLocations?: string[];
  }
): Array<{
  label: string;
  variationStrength?: number;
  sportPresetId?: string;
  lockedLocation?: string;
}> {
  if (axis === 'variation') {
    const base = input.baseVariation ?? 65;
    return Array.from({ length: count }, (_, index) => {
      const strength = Math.min(
        100,
        Math.max(0, Math.round(base - 20 + (40 / Math.max(1, count - 1)) * index))
      );
      return { label: `Var ${strength}`, variationStrength: strength };
    });
  }

  if (axis === 'sportPreset') {
    const presets = sportPresetsForMode('duo').slice(0, count);
    while (presets.length < count) {
      presets.push(sportPresetsForMode('duo')[presets.length % sportPresetsForMode('duo').length]);
    }
    return presets.map(preset => ({
      label: preset.label,
      sportPresetId: preset.id,
    }));
  }

  const locations = (input.recentLocations ?? []).filter(Boolean).slice(0, count);
  const fallback = [
    'forest trail',
    'city rooftop',
    'coastal cliff',
    'studio backdrop',
    'rainy alley',
    'open meadow',
  ];
  while (locations.length < count) {
    locations.push(fallback[locations.length % fallback.length]);
  }
  return locations.slice(0, count).map(location => ({
    label: location,
    lockedLocation: location,
  }));
}
