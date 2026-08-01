import { readFile } from "node:fs/promises";

import {
  discoverRelayTopology,
  normalizeMembersPayload,
  RelayHttpClient,
  RelayPrimaryRegionPlayerSession,
  relayWebSocketUri,
} from "../dist-server/game-data/index.js";

const relayBaseUrl = String(
  process.env.BITCRAFT_RELAY_ORIGIN ?? "https://relay.bitcraftsync.app",
).replace(/\/+$/, "");
const claimId = String(
  process.env.BITCRAFT_CLAIM_ID ?? "1369094286777412590",
);
const timeoutMs = Math.max(
  5_000,
  Number(process.env.RELAY_REGIONAL_VERIFY_TIMEOUT_MS ?? 45_000),
);
const manifest = JSON.parse(await readFile(
  new URL("../src/server/game-data/bindings/schema-manifest.json", import.meta.url),
  "utf8",
));

const http = new RelayHttpClient({ baseUrl: relayBaseUrl });
const [topology, claimPayload, membersPayload] = await Promise.all([
  discoverRelayTopology(relayBaseUrl),
  http.claim(claimId),
  http.members(claimId),
]);
const claim = claimPayload?.claim ?? claimPayload;
const regionId = String(claim?.region ?? claim?.region_id ?? claim?.regionId ?? "");
const source = topology.regions.get(regionId);
if (!source?.ready || !source.schemaFingerprint) {
  throw new Error(`Relay region ${regionId || "(unknown)"} source is not ready`);
}
const members = normalizeMembersPayload(membersPayload).data;
if (!members.length) throw new Error("Relay member payload was empty");

let session;
let timeout;
try {
  const snapshot = await new Promise((resolve, reject) => {
    timeout = setTimeout(() => {
      const health = session?.health();
      reject(new Error(
        `Timed out waiting for Relay region ${regionId} player snapshot after ${timeoutMs}ms`
        + (health?.lastError ? `: ${health.lastError}` : ""),
      ));
    }, timeoutMs);
    session = new RelayPrimaryRegionPlayerSession({ onSnapshot: resolve });
    void session.start({
      uri: relayWebSocketUri(relayBaseUrl, source.port),
      database: source.database,
      schemaFingerprint: source.schemaFingerprint,
      manifest,
      generation: 1,
      regionId,
      claimId,
      members,
    }).catch(reject);
  });
  if (snapshot.players.length !== members.length) {
    throw new Error(
      `Regional player snapshot count ${snapshot.players.length} did not match member count ${members.length}`,
    );
  }
  const regionalRowsFound = snapshot.players.filter(
    ({ timePlayedSeconds }) => timePlayedSeconds != null,
  ).length;
  const expectedMemberIds = members.map(({ playerEntityId }) => playerEntityId).sort();
  const actualTypedRowIds = snapshot.players
    .filter(({ timePlayedSeconds }) => timePlayedSeconds != null)
    .map(({ playerEntityId }) => playerEntityId)
    .sort();
  if (
    regionalRowsFound === 0
    || snapshot.warnings.length > 0
    || JSON.stringify(actualTypedRowIds) !== JSON.stringify(expectedMemberIds)
  ) {
    throw new Error(
      `Regional player verification found ${regionalRowsFound} typed rows with ${snapshot.warnings.length} warnings`,
    );
  }
  const crossClaimProjects = snapshot.construction.projects.filter(
    ({ ownerId }) => ownerId !== claimId,
  );
  const crossClaimBuildings = snapshot.construction.buildings.filter(
    ({ claimEntityId }) => claimEntityId !== claimId,
  );
  if (
    crossClaimProjects.length
    || crossClaimBuildings.length
    || snapshot.construction.buildings.length === 0
    || snapshot.constructionWarnings.length
  ) {
    throw new Error(
      `Regional construction verification found ${crossClaimProjects.length} cross-claim projects`
      + ` and ${crossClaimBuildings.length} cross-claim buildings`
      + ` with ${snapshot.constructionWarnings.length} warnings`,
    );
  }
  if (
    snapshot.research.claimId !== claimId
    || snapshot.research.learnedTechIds.length === 0
    || snapshot.researchWarnings.length
  ) {
    throw new Error(
      `Regional research verification found ${snapshot.research.learnedTechIds.length} learned technologies`
      + ` for claim ${snapshot.research.claimId} with ${snapshot.researchWarnings.length} warnings`,
    );
  }
  const crossClaimRecruitment = snapshot.recruitment.recruitment.filter(
    ({ claimEntityId }) => claimEntityId !== claimId,
  );
  if (
    snapshot.recruitment.claimId !== claimId
    || snapshot.recruitment.recruitment.length === 0
    || crossClaimRecruitment.length
    || snapshot.recruitmentWarnings.length
  ) {
    throw new Error(
      `Regional recruitment verification found ${snapshot.recruitment.recruitment.length} postings`
      + ` for claim ${snapshot.recruitment.claimId}, ${crossClaimRecruitment.length} cross-claim rows,`
      + ` and ${snapshot.recruitmentWarnings.length} warnings`,
    );
  }
  if (
    snapshot.bankInventories.buildings.length === 0
    || snapshot.bankInventoryWarnings.length
    || snapshot.bankInventories.buildings.some(
      ({ buildingEntityId, playerOwnerEntityId }) => !buildingEntityId || !playerOwnerEntityId,
    )
  ) {
    throw new Error(
      `Regional Town Bank verification found ${snapshot.bankInventories.buildings.length} personal inventories`
      + ` with ${snapshot.bankInventoryWarnings.length} warnings`,
    );
  }
  console.log(JSON.stringify({
    ok: true,
    sourceKey: source.sourceKey,
    database: snapshot.database,
    schemaFingerprint: snapshot.schemaFingerprint,
    receivedAt: snapshot.receivedAt,
    memberCount: members.length,
    playerCount: snapshot.players.length,
    signedInCount: snapshot.players.filter(({ signedIn }) => signedIn).length,
    travelerTaskCount: snapshot.players.reduce(
      (total, player) => total + (player.tasks?.tasks?.length ?? 0),
      0,
    ),
    completedTravelerTaskCount: snapshot.players.reduce(
      (total, player) => total + (player.tasks?.tasks?.filter(({ completed }) => completed).length ?? 0),
      0,
    ),
    equipmentMemberCount: snapshot.equipment.members.length,
    equippedItemCount: snapshot.equipment.members.reduce(
      (total, member) => total
        + member.equipment.equipmentSlots.filter(({ item }) => item != null).length,
      0,
    ),
    activeBuffCount: snapshot.equipment.members.reduce(
      (total, member) => total + member.buffs.buffs.length,
      0,
    ),
    constructionProjectCount: snapshot.construction.projects.length,
    claimBuildingCount: snapshot.construction.buildings.length,
    contributedConstructionStackCount: snapshot.construction.projects.reduce(
      (total, project) => total + project.items.length + project.cargos.length,
      0,
    ),
    learnedResearchCount: snapshot.research.learnedTechIds.length,
    researchingTechId: snapshot.research.researchingTechId,
    recruitmentPostingCount: snapshot.recruitment.recruitment.length,
    recruitmentStock: snapshot.recruitment.recruitment.map(({ remainingStock }) => remainingStock),
    recruitmentRequiresApproval: snapshot.recruitment.recruitment.some(
      ({ requiredApproval }) => requiredApproval,
    ),
    townBankInventoryCount: snapshot.bankInventories.buildings.length,
    townBankStackCount: snapshot.bankInventories.buildings.reduce(
      (total, inventory) => total + inventory.inventory.length,
      0,
    ),
    regionalRowsFound,
    warningCount: snapshot.warnings.length
      + snapshot.equipmentWarnings.length
      + snapshot.constructionWarnings.length
      + snapshot.researchWarnings.length
      + snapshot.recruitmentWarnings.length
      + snapshot.bankInventoryWarnings.length,
  }, null, 2));
} finally {
  clearTimeout(timeout);
  await session?.stop();
}
