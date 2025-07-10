# JSDoc Generation for AgentMark .prompt.mdx Files

This document explains the new JSDoc generation feature that automatically creates JSDoc documentation for your `.prompt.mdx` files based on their input schemas.

## Overview

The `generate-types` CLI command now supports generating JSDoc documentation alongside TypeScript types. This provides better IntelliSense support and documentation for your `.prompt.mdx` files, especially when working in MDX-aware editors.

## Features

✅ **Separate JSDoc File**: JSDoc lives in a separate `agentmark.jsdoc.js` file  
✅ **Schema-Based Generation**: Auto-generated from `input_schema` in each `.prompt.mdx` file  
✅ **TypeScript-like Documentation**: Follows JSDoc standards with `@param` annotations  
✅ **MDX Compatible**: Can be imported and used in `.prompt.mdx` files  
✅ **IDE Support**: Works with VS Code and other editors that support JSDoc  

## Usage

### 1. Generate JSDoc Documentation

Run the generate-types command with the new `--generate-jsdoc` flag:

```bash
# Generate both TypeScript types and JSDoc documentation
agentmark generate-types --root-dir ./your-prompts --generate-jsdoc

# Generate only TypeScript types (existing behavior)
agentmark generate-types --root-dir ./your-prompts
```

This creates two files:
- **TypeScript types**: Output to stdout (redirect to a `.ts` file)
- **JSDoc documentation**: Written to `agentmark.jsdoc.js` in the specified directory

### 2. Example .prompt.mdx File

Here's how to define a prompt with a comprehensive input schema:

```mdx
---
name: user-greeting
text_config:
  model_name: gpt-4o-mini
input_schema:
  type: object
  properties:
    userName:
      type: string
      description: "The name of the user"
    userAge:
      type: number
      description: "The age of the user"
    interests:
      type: array
      items:
        type: string
      description: "List of user interests"
    isVip:
      type: boolean
      description: "Whether the user is a VIP member"
  required:
    - userName
    - userAge
---

{/* Import JSDoc for IntelliSense support */}
import { UserGreeting } from './agentmark.jsdoc.js';

<s>
You are a helpful assistant that creates personalized greetings.
</s>

<User>
Hello! My name is {props.userName}, I am {props.userAge} years old, 
{props.isVip && "I'm a VIP member, "}
and I'm interested in {props.interests.join(', ')}.
</User>

<Assistant>
Hello {props.userName}! It's nice to meet you.
</Assistant>
```

### 3. Generated JSDoc Output

The above prompt generates the following JSDoc:

```javascript
/**
 * user-greeting - AgentMark Prompt
 *
 * This is an auto-generated JSDoc for the user-greeting.prompt.mdx prompt file.
 * Use this documentation to understand the expected input parameters.
 *
 * @param {string} userName - The name of the user
 * @param {number} userAge - The age of the user
 * @param {string[]} interests - List of user interests
 * @param {boolean} isVip - Whether the user is a VIP member
 *
 * @required userName, userAge
 *
 * @example
 * // Example usage in MDX:
 * import { UserGreeting } from './agentmark.jsdoc.js';
 * 
 * // With these props:
 * // userName: "example userName"
 * // userAge: 42
 * // interests: []
 * // isVip: true
 */
export function UserGreeting(props) {
  // This function serves as JSDoc documentation
  // The actual prompt logic is handled by AgentMark
  return props;
}
```

## Type Mapping

The JSDoc generator automatically maps JSON Schema types to JSDoc types:

| JSON Schema Type | JSDoc Type | Example |
|------------------|------------|---------|
| `string` | `{string}` | `@param {string} name` |
| `number` | `{number}` | `@param {number} age` |
| `integer` | `{number}` | `@param {number} count` |
| `boolean` | `{boolean}` | `@param {boolean} isActive` |
| `array` | `{Type[]}` | `@param {string[]} tags` |
| `object` | `{Object}` | `@param {Object} config` |

## MDX Integration

### IntelliSense Support

When you import the generated JSDoc functions in your `.prompt.mdx` files, compatible editors will provide:

- **Parameter completion** for `props.` access
- **Type hints** showing parameter types and descriptions
- **Required parameter warnings** when accessing undefined props
- **Hover documentation** showing full JSDoc comments

### Import Example

```mdx
---
name: my-prompt
input_schema:
  type: object
  properties:
    message: { type: string, description: "The user's message" }
---

{/* This import enables IntelliSense for props */}
import { MyPrompt } from './agentmark.jsdoc.js';

<User>{props.message}</User>
```

## Helper Functions

The generated JSDoc file includes a helper function to access all prompt documentation:

```javascript
/**
 * Helper function to get all available prompt documentation
 * @returns {Object} Object containing all prompt function references
 */
export function getAllPromptDocs() {
  return {
    "user-greeting.prompt.mdx": UserGreeting,
    "customer-support.prompt.mdx": CustomerSupport,
    // ... other prompts
  };
}
```

## Best Practices

1. **Define Comprehensive Schemas**: Include descriptions for all properties to get better JSDoc
2. **Use Meaningful Property Names**: They become parameter names in the JSDoc
3. **Mark Required Fields**: Use the `required` array in your JSON Schema
4. **Import in MDX Files**: Always import the corresponding JSDoc function for IntelliSense

## Editor Setup

### VS Code

For the best experience in VS Code:

1. Install the "MDX" extension
2. Enable TypeScript/JavaScript language features
3. The JSDoc imports will automatically provide IntelliSense

### Other Editors

Most editors that support:
- MDX syntax highlighting
- JavaScript/TypeScript IntelliSense
- JSDoc parsing

Will work with this feature.

## File Structure Example

```
your-project/
├── prompts/
│   ├── user-greeting.prompt.mdx
│   ├── customer-support.prompt.mdx
│   └── agentmark.jsdoc.js          # Generated JSDoc
├── agentmark.types.ts              # Generated TypeScript types
└── package.json
```

## Integration with Build Systems

You can integrate JSDoc generation into your build process:

```json
{
  "scripts": {
    "generate-docs": "agentmark generate-types --root-dir ./prompts --generate-jsdoc > agentmark.types.ts",
    "build": "npm run generate-docs && your-build-command"
  }
}
```

## Compatibility

- **MDX Version**: Compatible with MDX v2+
- **JSDoc Version**: Follows JSDoc 3.6+ standards
- **Editor Support**: VS Code, WebStorm, and other JSDoc-aware editors
- **AgentMark**: Requires AgentMark CLI v1.8.0+

## Troubleshooting

### JSDoc Not Updating
Make sure to regenerate the JSDoc file after changing input schemas:
```bash
agentmark generate-types --root-dir ./prompts --generate-jsdoc
```

### IntelliSense Not Working
1. Ensure the import path is correct in your `.prompt.mdx` file
2. Check that your editor supports MDX and JSDoc
3. Verify the generated JSDoc file exists and is valid JavaScript

### Missing Type Information
If properties don't have JSDoc types, add `type` and `description` fields to your input schema:

```yaml
input_schema:
  type: object
  properties:
    myParam:
      type: string
      description: "Description of this parameter"
```

## Future Enhancements

Planned improvements include:
- Support for nested object documentation
- Custom JSDoc templates
- Integration with documentation generators
- TypeScript declaration files for better type safety