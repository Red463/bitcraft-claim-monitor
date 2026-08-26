export function capturePublicPlanFragmentSecret(options?: {
  location?: Pick<Location, "pathname" | "search" | "hash">;
  history?: Pick<History, "replaceState">;
  sessionStorage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
}): string | null;

export function publicPlanAuthorization(
  pathname: string,
  sessionStorage?: Pick<Storage, "getItem">,
): { authorization?: string };

export function clearPublicPlanSecret(
  pathname: string,
  sessionStorage?: Pick<Storage, "removeItem">,
): void;
