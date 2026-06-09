import path from "path";
import fs from "fs-extra";
import { loadAgentmarkConfig, promptsDir, findFiles, determinePromptKind } from "../utils/project";
import { detectPromptTypeFromContent } from "../utils/prompt-detection";

interface BuildOptions {
  outDir?: string;
}

/**
 * Build command - compiles all .prompt.mdx files to pre-built AST JSON files.
 */
const build = async (options: BuildOptions = {}) => {
  const cwd = process.cwd();
  const config = loadAgentmarkConfig();

  // Determine source directory from agentmark.json
  const sourceDir = promptsDir(cwd, config);

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
  const { getTemplateDXInstance } = await import("@agentmark-ai/prompt-core");
  const { compressAst } = await import("@agentmark-ai/templatedx");

  // Find all prompt files
  // Normalize paths to forward slashes for cross-platform manifest consistency
  const promptFilesAbsolute = await findFiles(sourceDir, /\.prompt\.mdx$/);
  const promptFiles = promptFilesAbsolute.map((f) => path.relative(sourceDir, f).replace(/\\/g, '/'));

  console.log(`\nFound ${promptFiles.length} prompt(s)`);

  // Track build results
  const results: { prompts: string[]; errors: string[] } = {
    prompts: [],
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
        if (!resolvedPath.startsWith(sourceDir + path.sep) && resolvedPath !== sourceDir) {
          throw new Error(`Access denied: path outside source directory: ${filePath}`);
        }
        return fs.readFile(resolvedPath, "utf-8");
      };

      // Detect prompt type from content to choose the right parser
      const parserType = detectPromptTypeFromContent(content);
      const templateDX = getTemplateDXInstance(parserType);
      const ast = await templateDX.parse(content, sourceDir, contentLoader);

      // Resolve any JSON Schema $refs in input_schema / object_config.schema
      const { resolveAstSchemaRefs } = await import("@agentmark-ai/templatedx");
      await resolveAstSchemaRefs(ast, path.dirname(sourcePath), contentLoader);

      // Extract frontmatter to determine prompt kind and get metadata
      const frontmatter = templateDX.getFrontMatter(ast) as Record<string, any>;
      const promptKind = determinePromptKind(frontmatter);

      // Compress AST to reduce file size (modifies in place)
      compressAst(ast);

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

  // Copy non-prompt assets (datasets, schemas) to the build output so
  // FileLoader can resolve them at runtime. Without this, a built
  // prompt that references `dataset.jsonl` in its frontmatter would
  // throw "Dataset not found" because `dist/agentmark/dataset.jsonl`
  // doesn't exist — only the `.prompt.json` files do.
  //
  // Scope: any file not ending in `.prompt.mdx` (which is already
  // compiled to `.prompt.json` above) is treated as an asset and
  // copied verbatim preserving the relative path. Hidden files (those
  // whose path components start with `.`) are skipped to avoid
  // shipping editor / VCS metadata.
  const datasetFilesAbsolute = await findFiles(sourceDir, /\.jsonl$/);
  let datasetCopyCount = 0;
  for (const sourcePath of datasetFilesAbsolute) {
    const relativePath = path.relative(sourceDir, sourcePath).replace(/\\/g, "/");
    if (relativePath.split("/").some((seg) => seg.startsWith("."))) continue;
    const outputPath = path.join(outDir, relativePath);
    await fs.ensureDir(path.dirname(outputPath));
    await fs.copyFile(sourcePath, outputPath);
    datasetCopyCount++;
  }

  // Write manifest
  const manifest = {
    version: "1.0",
    builtAt: new Date().toISOString(),
    prompts: results.prompts.map((p) => ({
      path: p,
      outputPath: p.replace(/\.mdx$/, ".json"),
    })),
  };

  await fs.writeJson(path.join(outDir, "manifest.json"), manifest, { spaces: 2 });

  // Summary
  console.log("\n" + "─".repeat(50));
  console.log("Build complete!");
  console.log(`  Prompts:  ${results.prompts.length} built`);
  if (datasetCopyCount > 0) {
    console.log(`  Datasets: ${datasetCopyCount} copied`);
  }
  if (results.errors.length > 0) {
    console.log(`  Errors:   ${results.errors.length}`);
  }
  console.log(`  Output:   ${outDir}`);

  if (results.errors.length > 0) {
    process.exit(1);
  }
};

export default build;
