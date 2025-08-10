# Runner Tests

## Overview

We should provide proper testing for the runner logic.

## Testing Requirements

- Tests should always test real .prompt.mdx files for image, text, speech, and objects
- All fixtures can be found/created in the /fixtures directory.
- When testing "runPrompt" for a image example, we should always load the image prompt
- You can create utils for loading prompts into the right formats, etc.
- Tests MUST avoid mocking things like getFrontMatter, formatWithTestProps, etc. WE SHOULD ALWAYS USE REAL TEST DATA FROM REAL PROMPTS OR REAL DATASETS
- We should thoroughly test runPrompt for all prompt types, as well as runExperiment
- Dont mock datasets. Always include a dataset reference in the fixtures. These can be referenced under "test_settings"
- ALWAYS VALIDATE TESTS and BUILD pass

## Tests

- It should runPrompt for text with streaming
- It should runPrompt for text without streaming
- It should runPrompt for object with streaming
- It should runPrompt for object without streaming
- It should runPrompt for image without streaming
- It should runPrompt for speech without streaming
- It should runExperiment for text prompts with streaming
- It should runExperiment for image prompts with streaming
- It should runExperiment for object prompts with streaming
- It should runExperiment for speech prompts with streaming