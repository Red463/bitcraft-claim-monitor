type ToolchainManifest = {
  cli?: {
    version?: unknown;
    releaseTag?: unknown;
    artifacts?: unknown;
  };
  sdk?: {
    package?: unknown;
    version?: unknown;
  };
};

type PackageManifest = {
  dependencies?: Record<string, unknown>;
};

export function validateToolchainManifest(
  manifest: ToolchainManifest,
  packageJson: PackageManifest,
): { cliVersion: string; sdkVersion: string } {
  const cliVersion = String(manifest.cli?.version ?? "").trim();
  const sdkPackage = String(manifest.sdk?.package ?? "").trim();
  const sdkVersion = String(manifest.sdk?.version ?? "").trim();
  const installedVersion = String(packageJson.dependencies?.[sdkPackage] ?? "").trim();

  if (!cliVersion || !sdkVersion || cliVersion !== sdkVersion) {
    throw new Error("SpacetimeDB CLI and SDK versions must match");
  }
  if (sdkPackage !== "spacetimedb" || installedVersion !== sdkVersion) {
    throw new Error("SpacetimeDB SDK manifest must match the exact package dependency");
  }
  return { cliVersion, sdkVersion };
}
