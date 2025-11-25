/**
 * Setup script to generate pre-built JSON fixtures from MDX test files.
 * This script runs before the tests and creates the JSON fixtures that FileLoader expects.
 */
import path from "path";
import fs from "fs";
import { getTemplateDXInstance } from "../src/template_engines/templatedx-instances";

const fixturesDir = path.join(__dirname, "fixtures");
const datasetsDir = path.join(__dirname, "datasets");

/**
 * Determines the prompt kind based on frontmatter content.
 */
function determinePromptKind(frontmatter: any): "text" | "object" | "image" | "speech" {
  if (frontmatter.text_config) return "text";
  if (frontmatter.object_config) return "object";
  if (frontmatter.image_config) return "image";
  if (frontmatter.speech_config) return "speech";
  throw new Error("Could not determine prompt kind from frontmatter");
}

/**
 * Detect prompt type from raw file content by scanning frontmatter.
 */
function detectPromptTypeFromContent(content: string): "language" | "image" | "speech" {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return "language";
  }

  const frontmatter = frontmatterMatch[1];
  if (frontmatter.includes("image_config:")) return "image";
  if (frontmatter.includes("speech_config:")) return "speech";
  return "language";
}

/**
 * Build a single MDX file to a JSON fixture.
 */
export async function buildFixture(mdxPath: string): Promise<void> {
  const content = fs.readFileSync(mdxPath, "utf-8");
  const parserType = detectPromptTypeFromContent(content);
  const templateDX = getTemplateDXInstance(parserType);

  // Create a content loader for resolving imports
  const contentLoader = async (filePath: string) => {
    const resolvedPath = path.resolve(path.dirname(mdxPath), filePath);
    return fs.readFileSync(resolvedPath, "utf-8");
  };

  const ast = await templateDX.parse(content, fixturesDir, contentLoader);
  const frontmatter = templateDX.getFrontMatter(ast) as Record<string, any>;
  const promptKind = determinePromptKind(frontmatter);

  const relativePath = path.relative(path.dirname(fixturesDir), mdxPath);
  const output = {
    ast,
    metadata: {
      path: relativePath,
      kind: promptKind,
      name: frontmatter.name || path.basename(mdxPath, ".prompt.mdx"),
      builtAt: new Date().toISOString(),
    },
  };

  const jsonPath = mdxPath.replace(/\.mdx$/, ".json");
  fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2));
}

/**
 * Build all MDX fixtures to JSON.
 */
export async function setupFixtures(): Promise<void> {
  const files = fs.readdirSync(fixturesDir);

  for (const file of files) {
    if (file.endsWith(".prompt.mdx")) {
      const mdxPath = path.join(fixturesDir, file);
      try {
        await buildFixture(mdxPath);
      } catch (error: any) {
        // Some fixtures are intentionally invalid (for error testing)
        // Skip them but continue with others
        console.log(`Skipping ${file}: ${error.message}`);
      }
    }
  }
}

/**
 * Clean up generated JSON fixtures.
 */
export function cleanupFixtures(): void {
  const files = fs.readdirSync(fixturesDir);

  for (const file of files) {
    if (file.endsWith(".prompt.json")) {
      const jsonPath = path.join(fixturesDir, file);
      try {
        fs.unlinkSync(jsonPath);
      } catch {
        // Ignore errors
      }
    }
  }
}

// Run if called directly
if (process.argv[1] === __filename) {
  setupFixtures().then(() => {
    console.log("Fixtures built successfully");
  }).catch((error) => {
    console.error("Failed to build fixtures:", error);
    process.exit(1);
  });
}
