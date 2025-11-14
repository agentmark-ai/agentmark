import { Command } from 'commander';

/**
 * Extracts CLI command metadata for documentation purposes
 * This allows us to dynamically generate help/docs from the actual CLI definitions
 */

export interface CommandOption {
  flags: string;
  description: string;
  defaultValue?: any;
}

export interface CommandMetadata {
  name: string;
  description: string;
  options: CommandOption[];
}

/**
 * Extract options from a Commander command
 */
export function extractCommandMetadata(command: Command): CommandMetadata {
  const options: CommandOption[] = command.options.map(option => ({
    flags: option.flags,
    description: option.description || '',
    defaultValue: option.defaultValue
  }));

  return {
    name: command.name(),
    description: command.description(),
    options
  };
}

/**
 * Get metadata for all CLI commands by creating a temporary program
 */
export function getCliMetadata(): { [key: string]: CommandMetadata } {
  // Create a temporary commander program with the same structure as index.ts
  const tempProgram = new Command();

  const runPromptCmd = tempProgram
    .command('run-prompt <filepath>')
    .description('Run a prompt with test props')
    .option('--server <url>', 'URL of an AgentMark HTTP runner (e.g., http://localhost:9417)')
    .option('--props <json>', 'Props as JSON string (e.g., \'{"key": "value"}\')')
    .option('--props-file <path>', 'Path to JSON or YAML file containing props');

  const runExperimentCmd = tempProgram
    .command('run-experiment <filepath>')
    .description('Run an experiment against its dataset, with evals by default')
    .option('--server <url>', 'URL of an AgentMark HTTP runner (e.g., http://localhost:9417)')
    .option('--skip-eval', 'Skip running evals even if they exist')
    .option('--format <format>', 'Output format: table, csv, json, or jsonl (default: table)')
    .option('--threshold <percent>', 'Fail if pass percentage is below threshold (0-100)');

  return {
    'run-prompt': extractCommandMetadata(runPromptCmd),
    'run-experiment': extractCommandMetadata(runExperimentCmd)
  };
}

/**
 * Format command options as HTML for landing page
 */
export function formatOptionsAsHtml(options: CommandOption[]): string {
  return options.map(option => {
    // Parse the flags to extract the option name
    const flagMatch = option.flags.match(/--([a-z-]+)/);
    const optionName = flagMatch ? `--${flagMatch[1]}` : option.flags;

    // Check if option takes a value
    const takesValue = option.flags.includes('<') || option.flags.includes('[');
    const valueType = option.flags.match(/<([^>]+)>/)?.[1] || option.flags.match(/\[([^\]]+)\]/)?.[1];
    const displayName = takesValue && valueType ? `${optionName} &lt;${valueType}&gt;` : optionName;

    return `
  <div class="option">
    <div class="option-name">${displayName}</div>
    <div class="option-desc">${option.description}</div>
  </div>`;
  }).join('\n');
}
