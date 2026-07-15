export const PLANNER_SECTION_ORDER: readonly string[];
export type SharedPlannerTaxonomy = { hidden: boolean; row: string; section: string | null; order: number; known: boolean };
export function plannerTaxonomyFor(item: Record<string, unknown>): SharedPlannerTaxonomy;
export function plannerOverrideKeyFor(item: Record<string, unknown>, fallbackIdentity?: string): string;
export function plannerRowOrder(section: string, row: string): number;
