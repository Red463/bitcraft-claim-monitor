import type {
  CurrentStateReader,
  DomainDependencies,
  DomainKey,
  EntityId,
  GenerationDependency,
  StoredDomainSnapshot,
} from "./contracts.ts";

const CATALOG_ENRICHED_DOMAINS = new Set<DomainKey>([
  "inventories",
  "crafts",
  "public-crafts",
  "market",
  "equipment",
  "construction",
  "research",
  "recruitment",
]);

type CatalogRevisionReader = {
  getRevision(publicationSnapshot?: StoredDomainSnapshot | null): GenerationDependency | null;
};

function snapshotDependency(snapshot: StoredDomainSnapshot): GenerationDependency {
  return {
    generation: snapshot.generation,
    sourceKey: snapshot.provenance.sourceKey,
    receivedAt: snapshot.provenance.receivedAt,
  };
}

export function createGameDataCompositionDependencies(options: {
  claimId: EntityId;
  repository: CurrentStateReader;
  catalogRepository: CatalogRevisionReader;
}) {
  let catalogDependencies: DomainDependencies | null = null;
  const currentCatalogDependencies = (): DomainDependencies => {
    if (catalogDependencies) return catalogDependencies;
    const publicationSnapshot = options.repository.read(options.claimId, "catalogs");
    const catalog = options.catalogRepository.getRevision(publicationSnapshot);
    catalogDependencies = catalog ? { catalog } : {};
    return catalogDependencies;
  };

  return {
    forDomain(domain: DomainKey, snapshots: {
      inventoryBankSnapshot?: StoredDomainSnapshot | null;
      publicCraftSnapshot?: StoredDomainSnapshot | null;
    } = {}): DomainDependencies {
      const dependencies: DomainDependencies = CATALOG_ENRICHED_DOMAINS.has(domain)
        ? { ...currentCatalogDependencies() }
        : {};
      if (domain === "inventories" && snapshots.inventoryBankSnapshot) {
        dependencies["inventory-banks"] = snapshotDependency(snapshots.inventoryBankSnapshot);
      }
      if (domain === "crafts" && snapshots.publicCraftSnapshot) {
        dependencies["public-crafts"] = snapshotDependency(snapshots.publicCraftSnapshot);
      }
      return dependencies;
    },
  };
}
