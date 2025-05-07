# AI Editor Rules

## Overview
This document outlines the rules and formatting requirements for creating prompts in the Cursor AI editor. These rules enable users to generate structured prompts for AI models with consistent formatting and functionality.

## File Format
- All prompt files must use the `.prompt.mdx` file extension
- Example: `customer-reply.prompt.mdx`

## Prompt Types

### 1. Text Prompt
- Returns plain text responses
- Defined using `text_config` in frontmatter
- Schema is not allowed/used
- Default response format when no schema is specified

### 2. Object Prompt
- Returns structured data according to a defined schema
- Defined using `object_config` in frontmatter with schema included inside it
- Used when you need responses in a specific format (JSON)

## Basic Prompt Structure
Each prompt consists of two main sections:
1. **Header Section** (metadata) - enclosed by triple dashes (`---`)
2. **Content Section** (prompt content) - enclosed in XML-style tags

## Header Section Rules

### Required Fields
- **name**: Identifier for the prompt (e.g., `name: customer-reply`)

### Prompt Configuration
- **text_config**: Configuration for text prompts
  - Format includes model_name and optional parameters:
    ```
    text_config:
      model_name: gpt-4
      top_p: 1
      temperature: 0.7
      max_tokens: 4096
    ```
  
- **object_config**: Configuration for object prompts
  - Includes model_name, schema, and optional parameters:
    ```
    object_config:
      model_name: gpt-4
      top_p: 1
      temperature: 0.7
      max_tokens: 4096
      schema:
        type: object
        properties:
          answer:
            type: string
        required: ["answer"]
    ```

### Optional Fields
- **test_settings**: Sample values for testing
  - Format: 
    ```
    test_settings:
      props:
        variable_name: "sample value"
    ```

- **input_schema**: Defines expected input format
  - Uses JSON schema format
  - Example:
    ```
    input_schema:
      type: object
      properties:
        customer_question:
          type: string
          description: "The customer's question"
      required:
        - customer_question
    ```

## Content Section Rules

### Tags
- **`<System>`**: System instructions for the AI model (`<s>`. `<system>` are not valid tags)
- **`<User>`**: User inputs or questions
- **`<Assistant>`**: AI assistant responses

### Variable Interpolation
- Use curly braces to reference variables: `{props.variable_name}`
- Variables referenced must be defined in the input schema

### Formatting
- Whitespace within tags is preserved
- Markdown is supported within content sections
- Content can span multiple lines

## Complete Examples

### Example 1: Text Prompt (customer-reply.prompt.mdx)
```
---
name: customer-reply
text_config:
  model_name: gpt-4
  top_p: 1
  max_tokens: 4096
test_settings:
  props:
    customer_question: "I'm having trouble with my order"
input_schema:
  type: object
  properties:
    customer_question:
      type: string
      description: "The customer's question"
  required:
    - customer_question
---
<System>
You are a customer service agent for a company that sells products online. You are given a customer's reply and you need to respond to the customer's reply. You need to be friendly, professional, and helpful.
</System>

<User>{props.customer_question}</User>
```

### Example 2: Object Prompt (response-quality-eval.prompt.mdx)
```
---
name: response-quality-eval
object_config:
  model_name: gpt-4
  temperature: 0.7
  max_tokens: 4096
  schema:
    type: object
    properties:
      score:
        type: number
        description: "The score of the response"
      label:
        type: string
        description: "The label of the response"
      reason:
        type: string
        description: "The reason for the score"
    required:
      - score
      - label
      - reason
test_settings:
  props:
    customer_message: "I'm having trouble with my order"
    model_output: "I'm sorry to hear that. Please let me know what the issue is and I'll be happy to help."
input_schema:
  type: object
  properties:
    customer_message:
      type: string
      description: "The customer's message"
    model_output:
      type: string
      description: "The model's output"
  required:
    - customer_message
    - model_output
---
<User>
Rate the helpfulness and relevance of the suggested reply. Respond with a score (0-1) and a label from: helpful, somewhat helpful, unhelpful, irrelevant.

Message: {props.customer_message}
Suggested Reply: {props.model_output}
</User>
```

## Best Practices
1. Always save prompt files with the `.prompt.mdx` extension
2. Choose the appropriate prompt type (text or object) based on your needs
3. For text prompts, use `text_config` with the appropriate model_name
4. For object prompts, use `object_config` with the appropriate model_name and define a complete schema with all required properties
5. Always include descriptive names for your prompts
6. Define all variables used in content sections in the input schema
7. Include test settings to verify prompt functionality
8. Use appropriate tags for system instructions, user inputs, and assistant responses
9. Provide clear descriptions for schema properties