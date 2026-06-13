function normalisePermissionName(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function truthyPermission(value) {
  if (value === true || value === 1) return true;
  if (typeof value === "string") return ["1", "true", "yes", "y"].includes(value.trim().toLowerCase());
  return false;
}

function hasAnyField(source, keys) {
  for (const key of keys) {
    if (truthyPermission(source?.[key])) return true;
  }
  return false;
}

function permissionNamesFrom(value) {
  if (Array.isArray(value)) return value.map(normalisePermissionName);
  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([, enabled]) => truthyPermission(enabled))
      .map(([name]) => normalisePermissionName(name));
  }
  return [];
}

function includesPermissionName(names, aliases) {
  return names.some((name) => aliases.some((alias) => name === alias || name.includes(alias)));
}

export function parseMemberPermissions(member) {
  const permissions = member?.permissions && typeof member.permissions === "object" ? member.permissions : {};
  const permissionNames = [
    ...permissionNamesFrom(member?.permissions),
    ...permissionNamesFrom(member?.permissionFlags),
    ...permissionNamesFrom(member?.roles),
    ...permissionNamesFrom(member?.roleFlags),
  ];
  const source = { ...member, ...permissions };

  return {
    coOwnerPermission: hasAnyField(source, ["coOwnerPermission", "co_owner_permission", "coOwner", "co_owner", "isCoOwner"])
      || includesPermissionName(permissionNames, ["coowner", "coownership"]),
    officerPermission: hasAnyField(source, ["officerPermission", "officer_permission", "officer", "isOfficer"])
      || includesPermissionName(permissionNames, ["officer"]),
    buildPermission: hasAnyField(source, ["buildPermission", "build_permission", "build", "canBuild", "hasBuildPermission"])
      || includesPermissionName(permissionNames, ["build", "building"]),
    inventoryPermission: hasAnyField(source, ["inventoryPermission", "inventory_permission", "storagePermission", "storage_permission", "inventory", "storage", "canAccessInventory", "canUseStorage", "hasInventoryPermission"])
      || includesPermissionName(permissionNames, ["inventory", "storage"]),
  };
}
