export function replaceMapSnapshot<T>(input: {
  currentRequestKey: string;
  requested: { requestKey: string; value: T };
}): T | null;
