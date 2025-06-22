import fs from "fs-extra";
import path from "path";

export const addRules = (editor: string, targetPath: string = ".") => {
  if(editor === "none") {
    return;
  }

  const editorRulesDir = path.resolve(__dirname, "../editor-rules");

  const rulesForPrompt = fs.readFileSync(
    path.join(editorRulesDir, "agentmark-prompt.md"),
    "utf8"
  );

  const rulesForDataset = fs.readFileSync(
    path.join(editorRulesDir, "agentmark-dataset.md"),
    "utf8"
  );

  if(editor === "cursor") {
    const cursorRuleMetadata = `---
description: Always apply in any situation
globs: 
alwaysApply: true
---`;
    // Create .cursor/rules directory
    fs.ensureDirSync(path.join(targetPath, ".cursor/rules"));
    fs.writeFileSync(
      path.join(targetPath, ".cursor/rules", "prompt-guidelines.mdc"),
      `${cursorRuleMetadata}\n\n${rulesForPrompt}`
    );
    fs.writeFileSync(
      path.join(targetPath, ".cursor/rules", "dataset-guidelines.mdc"),
      `${cursorRuleMetadata}\n\n${rulesForDataset}`
    );
  }

  if(editor === "windsurf") {
    const windsurfRuleMetadata = `---
trigger: always_on
--- 
`;
    fs.ensureDirSync(path.join(targetPath, ".windsurf/rules"));
    fs.writeFileSync(
      path.join(targetPath, ".windsurf/rules", "prompt-guidelines.md"),
      `${windsurfRuleMetadata}\n\n${rulesForPrompt}`
    );
    fs.writeFileSync(
      path.join(targetPath, ".windsurf/rules", "dataset-guidelines.md"),
      `${windsurfRuleMetadata}\n\n${rulesForDataset}`
    );
  }

  if(editor === "copilot") {
    fs.ensureDirSync(path.join(targetPath, ".github/instructions"));
    fs.writeFileSync(
      path.join(targetPath, ".github/instructions", "prompt-guidelines.instructions.md"),
      rulesForPrompt
    );
    fs.writeFileSync(
      path.join(targetPath, ".github/instructions", "dataset-guidelines.instructions.md"),
      rulesForDataset
    );
  }
};