import {
  createGameCatalogRepository,
  gameCatalogKey,
} from "./gameCatalog.mjs";

const SOURCE_KEY = "global";

function text(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`Provider catalog ${label} is required`);
  return normalized;
}

function catalogKind(value) {
  if (value === 1 || value === "1" || String(value ?? "").toLowerCase() === "cargo") return "cargo";
  if (value === 0 || value === "0" || ["item", "items"].includes(String(value ?? "").toLowerCase())) return "items";
  throw new Error(`Provider catalog kind is invalid: ${String(value ?? "")}`);
}

function normalizedEntity(source) {
  const kind = catalogKind(source?.kind ?? source?.itemType ?? source?.item_type);
  const id = text(source?.id ?? source?.targetId ?? source?.target_id, "entity id");
  if (!/^\d+$/.test(id)) throw new Error(`Provider catalog entity id must be a decimal string: ${id}`);
  const name = text(source?.name, `name for ${kind}:${id}`);
  const tierValue = source?.tier == null ? null : Number(source.tier);
  if (tierValue != null && (!Number.isSafeInteger(tierValue) || tierValue < 0)) {
    throw new Error(`Provider catalog tier is invalid for ${kind}:${id}`);
  }
  return {
    catalogKey: gameCatalogKey(kind, id),
    kind,
    id,
    itemType: kind === "cargo" ? 1 : 0,
    name,
    tag: source?.tag == null ? null : String(source.tag),
    tier: tierValue,
    rarity: source?.rarity == null ? null : String(source.rarity),
    iconAssetName: source?.iconAssetName == null ? null : String(source.iconAssetName),
    itemListId: source?.itemListId == null ? null : String(source.itemListId),
  };
}

function normalizedMetadata(metadata, currentGeneration) {
  const generation = Number(metadata?.generation);
  if (!Number.isSafeInteger(generation) || generation <= 0) {
    throw new Error("Provider catalog generation must be a positive safe integer");
  }
  if (generation <= currentGeneration) {
    throw new Error(`Provider catalog generation ${generation} is not newer than ${currentGeneration}`);
  }
  const receivedAt = text(metadata?.receivedAt, "receivedAt");
  if (!Number.isFinite(Date.parse(receivedAt))) throw new Error("Provider catalog receivedAt is invalid");
  const provider = text(metadata?.provider, "provider");
  if (provider !== "relay") throw new Error(`Provider catalog provider is unsupported: ${provider}`);
  return {
    provider,
    database: text(metadata?.database, "database"),
    schemaFingerprint: text(metadata?.schemaFingerprint, "schema fingerprint"),
    generation,
    receivedAt,
  };
}

function mapSourceState(row) {
  return row ? {
    provider: row.provider,
    database: row.database_name,
    schemaFingerprint: row.schema_fingerprint,
    generation: Number(row.generation),
    receivedAt: row.received_at,
    rowCount: Number(row.row_count),
  } : null;
}

function normalizedDescriptions(descriptions) {
  if (!descriptions || typeof descriptions !== "object" || Array.isArray(descriptions)) {
    throw new Error("Provider catalog descriptions must be grouped by kind");
  }
  const normalized = [];
  const keys = new Set();
  for (const [kind, rows] of Object.entries(descriptions)) {
    if (!Array.isArray(rows)) throw new Error(`Provider catalog ${kind} descriptions must be an array`);
    for (const value of rows) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`Provider catalog ${kind} description must be an object`);
      }
      const rowKind = text(value.kind, "description kind");
      if (rowKind !== kind) throw new Error(`Provider catalog description kind mismatch: ${rowKind} !== ${kind}`);
      const id = text(value.id, `${kind} description id`);
      if (!/^\d+$/.test(id)) throw new Error(`Provider catalog description id must be a decimal string: ${id}`);
      const key = `${kind}:${id}`;
      if (keys.has(key)) throw new Error(`Duplicate catalog description: ${key}`);
      keys.add(key);
      normalized.push({ kind, id, dataJson: JSON.stringify(value) });
    }
  }
  return normalized;
}

export function createProviderCatalogRepository(db) {
  const catalog = createGameCatalogRepository(db);
  const statements = {
    listKeys: db.prepare("SELECT catalog_key FROM game_catalog_entities"),
    deleteEntity: db.prepare("DELETE FROM game_catalog_entities WHERE catalog_key = ?"),
    getSourceState: db.prepare("SELECT * FROM game_catalog_source_state WHERE source_key = ?"),
    upsertSourceState: db.prepare(`
      INSERT INTO game_catalog_source_state (
        source_key, provider, database_name, schema_fingerprint, generation, received_at, row_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_key) DO UPDATE SET
        provider = excluded.provider,
        database_name = excluded.database_name,
        schema_fingerprint = excluded.schema_fingerprint,
        generation = excluded.generation,
        received_at = excluded.received_at,
        row_count = excluded.row_count
    `),
    deleteDescriptions: db.prepare("DELETE FROM game_catalog_descriptions"),
    insertDescription: db.prepare(`
      INSERT INTO game_catalog_descriptions (
        description_kind, description_id, data_json, updated_at
      ) VALUES (?, ?, ?, ?)
    `),
    listDescriptions: db.prepare(`
      SELECT data_json FROM game_catalog_descriptions
      WHERE description_kind = ?
      ORDER BY CAST(description_id AS INTEGER), description_id
    `),
  };

  function replaceSnapshot(entities, descriptions, metadata) {
      if (!Array.isArray(entities) || entities.length === 0) {
        throw new Error("Provider catalog snapshot must contain at least one entity");
      }
      const normalized = entities.map(normalizedEntity);
      const normalizedDescriptionRows = descriptions == null ? null : normalizedDescriptions(descriptions);
      const keys = new Set();
      for (const entity of normalized) {
        if (keys.has(entity.catalogKey)) {
          throw new Error(`Duplicate catalog identity: ${entity.catalogKey}`);
        }
        keys.add(entity.catalogKey);
      }
      const current = mapSourceState(statements.getSourceState.get(SOURCE_KEY));
      const source = normalizedMetadata(metadata, current?.generation ?? 0);
      const staleKeys = statements.listKeys.all()
        .map((row) => row.catalog_key)
        .filter((catalogKey) => !keys.has(catalogKey));

      db.exec("BEGIN IMMEDIATE");
      try {
        for (const entity of normalized) {
          catalog.upsertEntityIdentity(entity, {
            kind: entity.kind,
            updatedAt: source.receivedAt,
          });
        }
        for (const catalogKey of staleKeys) statements.deleteEntity.run(catalogKey);
        catalog.deleteOrphanRecipes();
        if (normalizedDescriptionRows) {
          statements.deleteDescriptions.run();
          for (const description of normalizedDescriptionRows) {
            statements.insertDescription.run(
              description.kind,
              description.id,
              description.dataJson,
              source.receivedAt,
            );
          }
        }
        const rowCount = normalized.length + (normalizedDescriptionRows?.length ?? 0);
        statements.upsertSourceState.run(
          SOURCE_KEY,
          source.provider,
          source.database,
          source.schemaFingerprint,
          source.generation,
          source.receivedAt,
          rowCount,
        );
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }

      return {
        generation: source.generation,
        rowCount: normalized.length + (normalizedDescriptionRows?.length ?? 0),
        removedCount: staleKeys.length,
      };
  }

  return {
    replaceEntitySnapshot(entities, metadata) {
      return replaceSnapshot(entities, null, metadata);
    },
    replaceCatalogSnapshot(snapshot, metadata) {
      return replaceSnapshot(snapshot?.entities, snapshot?.descriptions, metadata);
    },
    getEntity(catalogKey) {
      return catalog.getEntity(catalogKey);
    },
    getSourceState() {
      return mapSourceState(statements.getSourceState.get(SOURCE_KEY));
    },
    listDescriptions(kind) {
      return statements.listDescriptions.all(String(kind ?? ""))
        .map((row) => JSON.parse(String(row.data_json)));
    },
  };
}
