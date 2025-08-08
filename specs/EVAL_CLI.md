# Eval CLI Support

We should support running evals as part of the CLI.

## Acceptance Criteria

Add a new `--eval` flag for `run-dataset` that can run evals as part of dataset runs, and display results properly in a table format. We should also initialize w/ valid eval examples.

## Coding Notes:

- Use TDD
- ALWAYS FAVOR CLEAN, READABLE CODE OVER COMPLEXITY
- ADD - DONE to each testing bullet in this markdown file once you complete them.

## Testing

- It should init valid examples that use evals - DONE
- It should throw a warning when the eval flag is used using `run-prompt`, but still run the prompt. - DONE
- It should execute the proper evals when using the `--eval` flag with `run-dataset`. - DONE
- It should surface an error in the CLI console, when a eval is referenced in a prompt, but not registered. - DONE
- It should allow multiple evals to be run, and they should each be displayed properly in the table. - DONE