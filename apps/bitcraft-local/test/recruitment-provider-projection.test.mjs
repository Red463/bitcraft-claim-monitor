import assert from "node:assert/strict";
import test from "node:test";

let projectionModule = null;
try {
  projectionModule = await import(
    new URL("../src/server/game-data/recruitmentProjection.ts", import.meta.url).href,
  );
} catch {
  // The first TDD run proves the recruitment projection is absent.
}

test("recruitment projection enriches exact skill requirements from the local catalog", () => {
  assert.ok(projectionModule, "recruitment projection module must exist");
  const result = projectionModule.enrichRecruitmentWithCatalog({
    claimId: "1369094286777412590",
    isRecruiting: true,
    recruitment: [{
      entityId: "1369094286821318198",
      claimEntityId: "1369094286777412590",
      remainingStock: "19",
      requiredSkillId: "1",
      requiredSkillLevel: "1",
      requiredApproval: false,
      isRecruiting: true,
    }],
  }, [{
    kind: "skill",
    id: "1",
    skillType: "1",
    name: "Forestry",
    description: "Harvest wood.",
    iconAssetName: "Skills/Forestry",
    title: "",
    category: "Gathering",
    maxLevel: 100,
  }]);

  assert.deepEqual(result, {
    data: {
      claimId: "1369094286777412590",
      isRecruiting: true,
      recruitment: [{
        entityId: "1369094286821318198",
        claimEntityId: "1369094286777412590",
        remainingStock: "19",
        requiredSkillId: "1",
        requiredSkillLevel: "1",
        requiredApproval: false,
        isRecruiting: true,
        requiredSkill: {
          kind: "skill",
          id: "1",
          skillType: "1",
          name: "Forestry",
          description: "Harvest wood.",
          iconAssetName: "Skills/Forestry",
          title: "",
          category: "Gathering",
          maxLevel: 100,
        },
      }],
    },
    warnings: [],
  });
});

test("recruitment projection exposes a missing skill catalog identity", () => {
  assert.ok(projectionModule, "recruitment projection module must exist");
  const result = projectionModule.enrichRecruitmentWithCatalog({
    claimId: "42",
    isRecruiting: true,
    recruitment: [{
      entityId: "99",
      claimEntityId: "42",
      remainingStock: "1",
      requiredSkillId: "9007199254740993",
      requiredSkillLevel: "12",
      requiredApproval: true,
      isRecruiting: true,
    }],
  }, []);

  assert.deepEqual(result.warnings, [
    "Recruitment posting 99 references skill 9007199254740993 missing from the global catalog.",
  ]);
  assert.equal(result.data.recruitment[0].requiredSkill, null);
});
