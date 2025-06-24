#!/usr/bin/env node

import { program } from "commander";
import init from "./commands/init";
import serve from "./commands/serve";
import dev from "./commands/dev";
import generateTypes from "./commands/generate-types";
import pullModels from "./commands/pull-models";

program
  .command("init")
  .description("Intialize the agentmark project")
  .option("-t, --target <target>", "Target to initialize the project for")
  .action(init);

program
  .command("serve")
  .option("-p, --port <number>", "Port to run on (default: 9002)")
  .description("Serve the agentmark templates")
  .action((options) => {
    serve({ port: parseInt(options.port || "9002", 10) });
  });

program
  .command('generate-types')
  .option('-l, --language <language>', 'Language to generate types for', 'typescript')
  .option('--local <port>', 'Local server port number')
  .option('--root-dir <path>', 'Root directory containing agentmark files')
  .action(async (options) => {
    const localPort = options.local ? parseInt(options.local, 10) : undefined;
    await generateTypes({ 
      language: options.language, 
      local: localPort,
      rootDir: options.rootDir
    });
  });

program
  .command("pull-models")
  .description('Pull models from a provider')
  .action(async () => {
    try {
      await pullModels();
    } catch (error) {
      program.error((error as Error).message);
    }
  });

program.parse(process.argv);
