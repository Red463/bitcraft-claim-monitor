export function mapEventNeedsSnapshot(event: unknown): boolean;
export type RequestedMapSnapshot<T> = { requestKey: string; value: T };
export function createMapSnapshotLoader<T>(options: {
  load: (requestKey: string) => Promise<T>;
  onValue?: (value: RequestedMapSnapshot<T>) => void;
  onError?: (error: unknown) => void;
  onLoading?: (loading: boolean) => void;
  isHidden?: () => boolean;
  currentRequestKey?: () => string;
}): { request(requestKey?: string): Promise<unknown>; stop(): void };
