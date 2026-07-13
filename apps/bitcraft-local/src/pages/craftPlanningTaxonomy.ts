import type { AnyRecord } from "../main-app-data";
import {
  plannerRowOrder,
  plannerTaxonomyFor as sharedPlannerTaxonomyFor,
  PLANNER_SECTION_ORDER,
} from "./craftPlanningTaxonomyData.mjs";

export { plannerRowOrder, PLANNER_SECTION_ORDER };

export type PlannerTaxonomy = {
  hidden: boolean;
  row: string;
  section: string | null;
  order: number;
  known: boolean;
};

export function plannerTaxonomyFor(item: AnyRecord): PlannerTaxonomy {
  return sharedPlannerTaxonomyFor(item);
}
