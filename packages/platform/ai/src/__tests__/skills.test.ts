/**
 * Skills 系统测试
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadSkills } from "../skills/loader";
import { formatSkillsForSystemPrompt, formatSkillInvocation } from "../skills/system-prompt";
import { createSkillManager } from "../skills/manager";
import type { Skill } from "../skills/types";

describe("Skills", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "skill-test-"));
  });

  test("loadSkills loads SKILL.md with frontmatter", async () => {
    const skillDir = join(tempDir, "test-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---
name: test-skill
description: A test skill
---
# Test Skill

This is the content.`,
      "utf-8",
    );

    const result = await loadSkills(tempDir);
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]!.name).toBe("test-skill");
    expect(result.skills[0]!.description).toBe("A test skill");
    expect(result.skills[0]!.content).toContain("# Test Skill");
    expect(result.diagnostics).toHaveLength(0);
  });

  test("loadSkills skips missing directories", async () => {
    const result = await loadSkills("/nonexistent/path");
    expect(result.skills).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(0);
  });

  test("loadSkills loads recursively", async () => {
    const skillDir1 = join(tempDir, "skill-one");
    const skillDir2 = join(tempDir, "sub", "skill-two");
    await mkdir(skillDir1, { recursive: true });
    await mkdir(skillDir2, { recursive: true });

    await writeFile(
      join(skillDir1, "SKILL.md"),
      `---
name: skill-one
description: First skill
---
Content 1`,
      "utf-8",
    );
    await writeFile(
      join(skillDir2, "SKILL.md"),
      `---
name: skill-two
description: Second skill
---
Content 2`,
      "utf-8",
    );

    const result = await loadSkills(tempDir);
    expect(result.skills).toHaveLength(2);
    const names = result.skills.map((s) => s.name).sort();
    expect(names).toEqual(["skill-one", "skill-two"]);
  });

  test("loadSkills skips skills without description", async () => {
    const skillDir = join(tempDir, "no-desc");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---
name: no-desc
---
Content without description`,
      "utf-8",
    );

    const result = await loadSkills(tempDir);
    expect(result.skills).toHaveLength(0);
  });

  test("loadSkills respects disableModelInvocation", async () => {
    const skillDir = join(tempDir, "hidden-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---
name: hidden-skill
description: Hidden from model
disable-model-invocation: true
---
Hidden content`,
      "utf-8",
    );

    const result = await loadSkills(tempDir);
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]!.disableModelInvocation).toBe(true);
  });
});

describe("formatSkillsForSystemPrompt", () => {
  test("returns empty string for no visible skills", () => {
    const skills: Skill[] = [
      { name: "hidden", description: "Hidden", content: "c", filePath: "/f", disableModelInvocation: true },
    ];
    expect(formatSkillsForSystemPrompt(skills)).toBe("");
  });

  test("formats visible skills as XML", () => {
    const skills: Skill[] = [
      { name: "my-skill", description: "A skill", content: "c", filePath: "/path/my-skill/SKILL.md" },
    ];
    const result = formatSkillsForSystemPrompt(skills);
    expect(result).toContain("<available_skills>");
    expect(result).toContain("<name>my-skill</name>");
    expect(result).toContain("<description>A skill</description>");
    expect(result).toContain("</available_skills>");
  });

  test("escapes XML special characters", () => {
    const skills: Skill[] = [
      { name: "test", description: 'Use <script> & "quotes"', content: "c", filePath: "/f" },
    ];
    const result = formatSkillsForSystemPrompt(skills);
    expect(result).toContain("&lt;script&gt;");
    expect(result).toContain("&amp;");
    expect(result).toContain("&quot;quotes&quot;");
  });
});

describe("formatSkillInvocation", () => {
  test("formats skill with content", () => {
    const skill: Skill = {
      name: "test",
      description: "Test",
      content: "Do this and that",
      filePath: "/skills/test/SKILL.md",
    };
    const result = formatSkillInvocation(skill);
    expect(result).toContain('<skill name="test"');
    expect(result).toContain("Do this and that");
    expect(result).toContain("References are relative to /skills/test");
  });

  test("appends additional instructions", () => {
    const skill: Skill = {
      name: "test",
      description: "Test",
      content: "Base content",
      filePath: "/skills/test/SKILL.md",
    };
    const result = formatSkillInvocation(skill, "Extra instructions");
    expect(result).toContain("Extra instructions");
  });
});

describe("SkillManager", () => {
  test("dynamic add and remove", async () => {
    const manager = createSkillManager({ dirs: [] });
    const skill: Skill = {
      name: "dynamic",
      description: "Dynamic skill",
      content: "content",
      filePath: "/test",
    };

    manager.addSkill(skill);
    expect(manager.getSkills()).toHaveLength(1);
    expect(manager.getSkill("dynamic")).toBeDefined();

    manager.removeSkill("dynamic");
    expect(manager.getSkills()).toHaveLength(0);
  });

  test("addSkill replaces existing with same name", async () => {
    const manager = createSkillManager({ dirs: [] });
    manager.addSkill({ name: "a", description: "v1", content: "c1", filePath: "/f1" });
    manager.addSkill({ name: "a", description: "v2", content: "c2", filePath: "/f2" });

    expect(manager.getSkills()).toHaveLength(1);
    expect(manager.getSkill("a")!.description).toBe("v2");
  });
});
