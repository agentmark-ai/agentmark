import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs-extra";
import path from "path";
import { exec, execFile } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Mock console.error to avoid noise in tests
const originalConsoleError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});

afterEach(() => {
  console.error = originalConsoleError;
});

describe("generate-types CLI command", () => {
  const fixturesDir = path.resolve(__dirname, "fixtures");
  const tempDir = path.resolve(__dirname, "temp");
  const cliPath = path.resolve(__dirname, "../dist/src/index.js");

  beforeEach(async () => {
    // Ensure temp directory exists and is clean
    await fs.ensureDir(tempDir);
    await fs.emptyDir(tempDir);
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.remove(tempDir);
  });

  describe("TypeScript generation", () => {
    it("should generate TypeScript types for prompts with input schemas", async () => {
      const { stdout } = await execAsync(
        `node ${cliPath} generate-types --root-dir ${fixturesDir}`
      );

      // Check that TypeScript interfaces are generated
      expect(stdout).toContain("interface UserGreetingIn");
      expect(stdout).toContain("interface DataAnalysisIn");
      expect(stdout).toContain("interface SimplePromptIn");

      // Check that the UserGreeting interface has the correct properties
      expect(stdout).toContain("userName: string;");
      expect(stdout).toContain("age: number;");
      expect(stdout).toContain("email: string;");
      // The interests field has min/max constraints so it's generated as a union of tuples
      expect(stdout).toContain("interests?:");
      expect(stdout).toContain("isVip?: boolean;");
      expect(stdout).toContain("preferences?: {");
      expect(stdout).toContain('theme: "light" | "dark" | "auto";');
      expect(stdout).toContain("notifications?: boolean;");
      expect(stdout).toContain("metadata?: {");

      // Check DataAnalysis interface
      expect(stdout).toContain("dataset: string;");
      expect(stdout).toContain('analysisType: "trend" | "correlation" | "summary" | "forecast";');
      expect(stdout).toContain("timeframe?: string;");

      // Check output interfaces
      expect(stdout).toContain("type UserGreetingOut = string");
      expect(stdout).toContain("type SimplePromptOut = string");

      // Check that the main AgentmarkTypes interface is present
      expect(stdout).toContain("export default interface AgentmarkTypes");
      expect(stdout).toContain('"user-greeting.prompt.mdx": UserGreeting');
      expect(stdout).toContain('"data-analysis.prompt.mdx": DataAnalysis');
      expect(stdout).toContain('"simple-prompt.prompt.mdx": SimplePrompt');
    });

    it("should handle prompts without input schemas gracefully", async () => {
      const { stdout } = await execAsync(
        `node ${cliPath} generate-types --root-dir ${fixturesDir}`
      );

      // Simple prompt should have empty input interface
      expect(stdout).toContain("interface SimplePromptIn { [key: string]: any }");
    });

    it("should generate proper object prompt types", async () => {
      const { stdout } = await execAsync(
        `node ${cliPath} generate-types --root-dir ${fixturesDir}`
      );

      // Check object prompt output type
      expect(stdout).toContain("interface DataAnalysisOut");
      expect(stdout).toContain("summary: string;");
      expect(stdout).toContain("insights: {");
      expect(stdout).toContain("insight: string;");
      expect(stdout).toContain("confidence: number;");
      expect(stdout).toContain("recommendations: string[];");

      // Check that it's marked as object kind (using single quotes)
      expect(stdout).toContain("kind: 'object';");
    });
  });

  describe("JSDoc generation", () => {
    it("should generate JSDoc when language is set to jsdoc", async () => {
      const { stdout, stderr } = await execAsync(
        `node ${cliPath} generate-types --root-dir ${fixturesDir} --language jsdoc`
      );

      // Check that JSDoc is output to stdout
      expect(stdout).toContain("@typedef {object} UserGreetingProps");
      expect(stdout).toContain("@property {string} userName - The user's full name");
      expect(stdout).toContain("Auto-generated JSDoc typedefs from AgentMark .prompt.mdx files");
      
      // Check that success message is in stderr
      expect(stderr).toContain("JSDoc generation completed successfully!");
    });

    it("should generate proper JSDoc typedefs for prompts with schemas", async () => {
      const { stdout } = await execAsync(
        `node ${cliPath} generate-types --root-dir ${fixturesDir} --language jsdoc`
      );

      // Check UserGreeting JSDoc
      expect(stdout).toContain("@typedef {object} UserGreetingProps");
      expect(stdout).toContain("@property {string} userName - The user's full name");
      expect(stdout).toContain("@property {integer} age - The user's age in years");
      expect(stdout).toContain("@property {string} email - User's email address");
      expect(stdout).toContain("@property {array} [interests] - List of user interests and hobbies");
      expect(stdout).toContain("@property {boolean} [isVip] - Whether the user is a VIP member");
    });

    it("should handle complex nested object schemas in JSDoc", async () => {
      const { stdout } = await execAsync(
        `node ${cliPath} generate-types --root-dir ${fixturesDir} --language jsdoc`
      );

      // Check DataAnalysis JSDoc
      expect(stdout).toContain("@typedef {object} DataAnalysisProps");
      expect(stdout).toContain("@property {string} dataset - Raw dataset to analyze");
      expect(stdout).toContain('@property {"trend"|"correlation"|"summary"|"forecast"} analysisType - Type of analysis to perform');
      expect(stdout).toContain("@property {string} [timeframe] - Time period for the analysis");
    });

    it("should allow users to redirect JSDoc output to a file", async () => {
      // Copy fixtures to temp directory for this test
      await fs.copy(fixturesDir, tempDir);

      const outputFile = path.join(tempDir, "custom-jsdoc.js");
      await execAsync(
        `node ${cliPath} generate-types --root-dir ${tempDir} --language jsdoc > ${outputFile}`
      );

      // Check that the file was created with JSDoc content
      expect(await fs.pathExists(outputFile)).toBe(true);
      const jsdocContent = await fs.readFile(outputFile, "utf-8");
      expect(jsdocContent).toContain("@typedef {object} UserGreetingProps");
      expect(jsdocContent).toContain("Auto-generated JSDoc typedefs");
    });
  });

  describe("Error handling", () => {
    it("should handle invalid JSON schemas gracefully", async () => {
      // Create a prompt with invalid schema
      const invalidPromptContent = `---
name: invalid-schema
text_config:
  model_name: gpt-4o-mini
input_schema:
  type: object
  properties:
    invalidProp:
      type: invalidType
---

<s>Test prompt</s>`;

      const invalidPromptPath = path.join(tempDir, "invalid.prompt.mdx");
      await fs.writeFile(invalidPromptPath, invalidPromptContent);

      // Both TypeScript and JSDoc should handle invalid schemas gracefully
      const { stderr: tsStderr } = await execAsync(
        `node ${cliPath} generate-types --root-dir ${tempDir} --language typescript`
      );
      expect(tsStderr).toContain("Type generation completed successfully!");

      const { stderr: jsStderr } = await execAsync(
        `node ${cliPath} generate-types --root-dir ${tempDir} --language jsdoc`
      );
      expect(jsStderr).toContain("JSDoc generation completed successfully!");
    });

    it("should handle empty directory gracefully", async () => {
      const emptyDir = path.join(tempDir, "empty");
      await fs.ensureDir(emptyDir);

      // Both languages should handle empty directories
      const { stdout: tsOutput, stderr: tsStderr } = await execAsync(
        `node ${cliPath} generate-types --root-dir ${emptyDir} --language typescript`
      );
      expect(tsOutput).toContain("export default interface AgentmarkTypes");
      expect(tsStderr).toContain("Type generation completed successfully!");

      const { stdout: jsOutput, stderr: jsStderr } = await execAsync(
        `node ${cliPath} generate-types --root-dir ${emptyDir} --language jsdoc`
      );
      expect(jsOutput).toContain("Auto-generated JSDoc typedefs");
      expect(jsStderr).toContain("JSDoc generation completed successfully!");
    });

    it("should validate language option", async () => {
      try {
        await execAsync(`node ${cliPath} generate-types --root-dir ${tempDir} --language python`);
        expect.fail("Should have thrown an error for unsupported language");
      } catch (error: any) {
        // Command should exit with non-zero code
        expect(error.code).toBeGreaterThan(0);
        // Error message should be in stderr
        expect(error.stderr).toContain("Unsupported language: python");
        expect(error.stderr).toContain("Supported languages: typescript, jsdoc");
      }
    });

    it("should validate root directory exists", async () => {
      const nonExistentDir = path.join(tempDir, "does-not-exist");
      
      try {
        await execAsync(`node ${cliPath} generate-types --root-dir ${nonExistentDir}`);
        expect.fail("Should have thrown an error for non-existent directory");
      } catch (error: any) {
        expect(error.code).toBeGreaterThan(0);
      }
    });
  });

  describe("Integration with json-schema-to-jsdoc package", () => {
    it("should properly use json-schema-to-jsdoc package features", async () => {
      const { stdout } = await execFile(
        "node",
        [cliPath, "generate-types", "--root-dir", fixturesDir, "--language", "jsdoc"]
      );

      // Verify features that are specific to json-schema-to-jsdoc package
      expect(stdout).toContain("@typedef");
      expect(stdout).toContain("@property");
      
      // Check that optional properties are marked with []
      expect(stdout).toContain("[interests]");
      expect(stdout).toContain("[isVip]");
      expect(stdout).toContain("[preferences]");
      expect(stdout).toContain("[timeframe]");

      // Check that enum values are properly formatted
      expect(stdout).toContain('"trend"|"correlation"|"summary"|"forecast"');
      
      // Check that descriptions are preserved
      expect(stdout).toContain("The user's full name");
      expect(stdout).toContain("The user's age in years");
      expect(stdout).toContain("User's email address");
    });
  });
});