import type { Area } from '../types';

/** One source of truth for how each skill is named and coloured in the UI. */
export const AREA_META: Record<Area, { label: string; short: string; sym: string; color: string }> = {
  add: { label: 'Addition', short: 'Add', sym: '+', color: 'var(--color-skill-add)' },
  sub: { label: 'Subtraction', short: 'Sub', sym: '−', color: 'var(--color-skill-sub)' },
  mul: { label: 'Multiplication', short: 'Mul', sym: '×', color: 'var(--color-skill-mul)' },
  div: { label: 'Division', short: 'Div', sym: '÷', color: 'var(--color-skill-div)' },
};

export function areaList(areas: Area[]): string {
  return areas.map((a) => AREA_META[a].label).join(', ');
}
