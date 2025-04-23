# Rules for Creating AgentMark Datasets in AI Editor

## Dataset Format
- Files must be in JSONL format (one JSON object per line)
- Each line represents a single test item
- No blank lines or comments allowed

## Test Item Structure
Each test item should follow one of these formats:

### Input-Only Format
```json
{
  "input": {
    "userMessage": "Your test question goes here"
  }
}
```

### Input-Output Format
```json
{
  "input": {
    "userMessage": "Your test question goes here"
  },
  "expected_output": "The expected answer to the question"
}
```

## Field Requirements

### "input" Field (Required)
- Must be an object containing at least a "userMessage" field
- "userMessage" must be a string containing the test question

### "expected_output" Field (Optional)
- String containing the expected answer
- Used for automatic evaluation
- Omit this field if you only want to test model execution without comparing outputs

## Creating Test Items

### Guidelines for Questions
- Write clear, unambiguous test questions
- Include all necessary context in the userMessage
- Phrase questions as a user would naturally ask them

### Guidelines for Expected Outputs
- Keep expected outputs concise and focused
- Include only essential information needed to answer the question
- Avoid unnecessary explanations unless testing for them

## Best Practices

1. Group related questions together
2. Include a variety of question types and difficulties
3. Use descriptive names that reflect the test content
4. Validate the JSONL format before submission
5. Ensure each line is a complete, valid JSON object
6. Test the dataset with your evaluation framework before finalizing

## Example Dataset

```jsonl
{"input":{"userMessage":"Why is 1/0 infinity?"}}
{"input":{"userMessage":"What is 7 times 9?"},"expected_output":"7 times 9 equals 63."}
{"input":{"userMessage":"How do I find the area of a circle?"},"expected_output":"To find the area of a circle, multiply pi (π) by the radius squared (r²). The formula is A = πr²."}
{"input":{"userMessage":"What's the capital of France?"},"expected_output":"The capital of France is Paris."}
{"input":{"userMessage":"Write a function in Python to check if a number is prime."}}
```