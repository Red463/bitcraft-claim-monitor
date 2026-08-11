type BankRecord = Record<string, any>;
type SourceRules = {
  bankPlayerIds?: string[];
  bankContainerIds?: string[];
  [key: string]: any;
};

export function mergeLegacyBankDiscovery<T extends SourceRules>(sourceRules: T, playerId: string, banks?: BankRecord[]): T;
export function finalizeLegacyBankMigrations<T extends SourceRules>(sourceRules: T, successfulPlayerIds?: string[]): T;
export function initiallyExpandedBankPlayerIds(sourceRules?: SourceRules): string[];
export function buildCraftPlanBankGroups(options?: {
  players?: BankRecord[];
  bankLoads?: Record<string, BankRecord>;
  trackedBankIds?: string[];
  search?: string;
  trackedOnly?: boolean;
}): Array<{
  playerId: string;
  playerName: string;
  loadState?: BankRecord;
  visibleBanks: BankRecord[];
  trackedCount: number;
  nonEmptyCount: number;
}>;
export function runBankDiscoveryQueue<T>(players: T[], worker: (player: T) => Promise<void>, concurrency?: number): Promise<void>;
