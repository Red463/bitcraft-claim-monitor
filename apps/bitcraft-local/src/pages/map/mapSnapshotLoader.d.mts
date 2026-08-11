export function mapEventNeedsSnapshot(event: unknown): boolean;
export function createMapSnapshotLoader<T>(options: {
  load: () => Promise<T>;
  onValue?: (value: T) => void;
  onError?: (error: unknown) => void;
  onLoading?: (loading: boolean) => void;
  isHidden?: () => boolean;
}): { request(): Promise<unknown>; stop(): void };
