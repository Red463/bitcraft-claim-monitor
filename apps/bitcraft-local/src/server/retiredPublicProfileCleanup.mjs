export const RETIRED_PUBLIC_PROFILE_TABLES = Object.freeze([
  "public_craft_plan_events",
  "public_craft_plan_share_links",
  "public_craft_plan_invites",
  "public_craft_plan_members",
  "public_craft_plans",
  "public_user_legal_acceptances",
  "public_user_sessions",
  "public_user_accounts",
]);

function existingTables(db) {
  const candidates = new Set(RETIRED_PUBLIC_PROFILE_TABLES);
  return db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => String(row.name))
    .filter((name) => candidates.has(name));
}

function tableExists(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

export function inspectRetiredPublicProfile(db) {
  const tables = existingTables(db).map((name) => ({
    name,
    rows: Number(db.prepare(`SELECT COUNT(*) AS count FROM "${name}"`).get()?.count ?? 0),
  }));
  const publicAuditRows = tableExists(db, "admin_audit_log")
    ? Number(db.prepare("SELECT COUNT(*) AS count FROM admin_audit_log WHERE action LIKE 'public.%'").get()?.count ?? 0)
    : 0;
  return { tables, publicAuditRows };
}

export function removeRetiredPublicProfileData(db) {
  const before = inspectRetiredPublicProfile(db);
  let deletedAuditRows = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    if (tableExists(db, "admin_audit_log")) {
      deletedAuditRows = Number(db.prepare("DELETE FROM admin_audit_log WHERE action LIKE 'public.%'").run().changes);
    }
    const present = new Set(existingTables(db));
    for (const name of RETIRED_PUBLIC_PROFILE_TABLES) {
      if (present.has(name)) db.exec(`DROP TABLE "${name}"`);
    }
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Preserve the original cleanup error.
    }
    throw error;
  }
  return {
    before,
    after: inspectRetiredPublicProfile(db),
    deletedAuditRows,
  };
}
