import path from "path";
import fs from "fs-extra";

interface AgentmarkConfig {
  agentmarkPath?: string;
  version?: string;
  mdxVersion?: string;
}

interface BuildOptions {
  outDir?: string;
}

/**
 * Reads the agentmark.json config file from the current directory.
 */
function getAgentmarkConfig(): AgentmarkConfig {
  const configPath = path.join(process.cwd(), "agentmark.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(
      "agentmark.json not found in current directory. Run this command from your AgentMark project root."
    );
  }
  return fs.readJsonSync(configPath);
}

/**
 * Determines the prompt kind based on frontmatter content.
 */
function determinePromptKind(frontmatter: any): 'text' | 'object' | 'image' | 'speech' {
  if (frontmatter.text_config) return 'text';
  if (frontmatter.object_config) return 'object';
  if (frontmatter.image_config) return 'image';
  if (frontmatter.speech_config) return 'speech';
  throw new Error('Could not determine prompt kind from frontmatter');
}

/**
 * Detect prompt type from raw file content by scanning frontmatter.
 * This allows us to choose the correct parser before full parsing.
 */
function detectPromptTypeFromContent(content: string): 'language' | 'image' | 'speech' {
  // Simple detection by looking for config keys in frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return 'language'; // Default to language if no frontmatter
  }

  const frontmatter = frontmatterMatch[1];
  if (frontmatter.includes('image_config:')) return 'image';
  if (frontmatter.includes('speech_config:')) return 'speech';
  return 'language'; // text_config and object_config use language parser
}

/**
 * Recursively find all files matching a pattern in a directory.
 */
async function findFiles(dir: string, pattern: RegExp): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && pattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  await walk(dir);
  return results;
}

/**
 * Build command - compiles all .prompt.mdx files to pre-built AST JSON files.
 * Also copies dataset files (.jsonl) to the output directory.
 */
const build = async (options: BuildOptions = {}) => {
  const cwd = process.cwd();
  const config = getAgentmarkConfig();

  // Determine source directory from agentmark.json
  const agentmarkPath = config.agentmarkPath || ".";
  const sourceDir = path.resolve(cwd, agentmarkPath, "agentmark");

  if (!fs.existsSync(sourceDir)) {
    throw new Error(
      `AgentMark directory not found: ${sourceDir}. Check your agentmark.json configuration.`
    );
  }

  // Determine output directory
  const outDir = path.resolve(cwd, options.outDir || "dist/agentmark");

  console.log("Building AgentMark prompts...");
  console.log(`  Source: ${sourceDir}`);
  console.log(`  Output: ${outDir}`);

  // Ensure output directory exists
  await fs.ensureDir(outDir);

  // Import templatedx for parsing
  const { getTemplateDXInstance } = await import("@agentmark/prompt-core");

  // Find all prompt files
  const promptFilesAbsolute = await findFiles(sourceDir, /\.prompt\.mdx$/);
  const promptFiles = promptFilesAbsolute.map((f) => path.relative(sourceDir, f));

  // Find all dataset files
  const datasetFilesAbsolute = await findFiles(sourceDir, /\.jsonl$/);
  const datasetFiles = datasetFilesAbsolute.map((f) => path.relative(sourceDir, f));

  console.log(`\nFound ${promptFiles.length} prompt(s) and ${datasetFiles.length} dataset(s)`);

  // Track build results
  const results: { prompts: string[]; datasets: string[]; errors: string[] } = {
    prompts: [],
    datasets: [],
    errors: [],
  };

  // Build each prompt file
  for (const promptFile of promptFiles) {
    const sourcePath = path.join(sourceDir, promptFile);
    const relativePath = promptFile;

    try {
      // Read the file content
      const content = await fs.readFile(sourcePath, "utf-8");

      // Create a content loader for resolving imports
      const contentLoader = async (filePath: string) => {
        const resolvedPath = path.resolve(path.dirname(sourcePath), filePath);
        // Ensure the resolved path is within the source directory
        if (!resolvedPath.startsWith(sourceDir)) {
          throw new Error(`Access denied: path outside source directory: ${filePath}`);
        }
        return fs.readFile(resolvedPath, "utf-8");
      };

      // Detect prompt type from content to choose the right parser
      const parserType = detectPromptTypeFromContent(content);
      const templateDX = getTemplateDXInstance(parserType);
      const ast = await templateDX.parse(content, sourceDir, contentLoader);

      // Extract frontmatter to determine prompt kind and get metadata
      const frontmatter = templateDX.getFrontMatter(ast) as Record<string, any>;
      const promptKind = determinePromptKind(frontmatter);

      // Build output structure
      const output = {
        ast,
        metadata: {
          path: relativePath,
          kind: promptKind,
          name: frontmatter.name || path.basename(promptFile, ".prompt.mdx"),
          builtAt: new Date().toISOString(),
        },
      };

      // Write the built prompt
      // Output path mirrors source structure: foo/bar.prompt.mdx -> foo/bar.prompt.json
      const outputPath = path.join(
        outDir,
        relativePath.replace(/\.mdx$/, ".json")
      );
      await fs.ensureDir(path.dirname(outputPath));
      await fs.writeJson(outputPath, output, { spaces: 2 });

      results.prompts.push(relativePath);
      console.log(`  ✓ ${relativePath}`);
    } catch (error: any) {
      results.errors.push(`${relativePath}: ${error.message}`);
      console.error(`  ✗ ${relativePath}: ${error.message}`);
    }
  }

  // Copy dataset files
  for (const datasetFile of datasetFiles) {
    const sourcePath = path.join(sourceDir, datasetFile);
    const outputPath = path.join(outDir, datasetFile);

    try {
      await fs.ensureDir(path.dirname(outputPath));
      await fs.copy(sourcePath, outputPath);
      results.datasets.push(datasetFile);
      console.log(`  ✓ ${datasetFile} (dataset)`);
    } catch (error: any) {
      results.errors.push(`${datasetFile}: ${error.message}`);
      console.error(`  ✗ ${datasetFile}: ${error.message}`);
    }
  }

  // Write manifest
  const manifest = {
    version: "1.0",
    builtAt: new Date().toISOString(),
    prompts: results.prompts.map((p) => ({
      path: p,
      outputPath: p.replace(/\.mdx$/, ".json"),
    })),
    datasets: results.datasets,
  };

  await fs.writeJson(path.join(outDir, "manifest.json"), manifest, { spaces: 2 });

  // Summary
  console.log("\n" + "─".repeat(50));
  console.log("Build complete!");
  console.log(`  Prompts:  ${results.prompts.length} built`);
  console.log(`  Datasets: ${results.datasets.length} copied`);
  if (results.errors.length > 0) {
    console.log(`  Errors:   ${results.errors.length}`);
  }
  console.log(`  Output:   ${outDir}`);

  if (results.errors.length > 0) {
    process.exit(1);
  }
};

export default build;
