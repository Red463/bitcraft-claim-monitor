export const PLANNER_SECTION_ORDER: readonly string[];
export type SharedPlannerTaxonomy = { hidden: boolean; row: string; section: string | null; order: number; known: boolean };
export function plannerTaxonomyFor(item: Record<string, unknown>): SharedPlannerTaxonomy;
export function plannerRowOrder(section: string, row: string): number;
