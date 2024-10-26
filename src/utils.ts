import { JSONObject } from "./types";

export function omit<T extends JSONObject>(
  obj: T,
  ...keysToOmit: (keyof T)[]
): Partial<T> {
  const result: Partial<T> = {};

  for (const key in obj) {
    if (obj.hasOwnProperty(key) && !keysToOmit.includes(key)) {
      result[key] = obj[key];
    }
  }

  return result;
}

export function toFrontMatter(content: JSONObject): string {
  function jsonToFrontMatter(json: JSONObject, indent = 0) {
    let frontMatter = "";
    const indentation = "  ".repeat(indent); // For nested indentation

    for (const key in json) {
      if (json.hasOwnProperty(key)) {
        const value = json[key];

        if (typeof value === "object" && !Array.isArray(value)) {
          // Nested object
          frontMatter += `${indentation}${key}:\n`;
          frontMatter += jsonToFrontMatter(value, indent + 1); // Recursive call
        } else if (Array.isArray(value)) {
          // Array handling
          frontMatter += `${indentation}${key}:\n`;
          value.forEach((item) => {
            if (typeof item === "object") {
              frontMatter += `${indentation}-\n`;
              frontMatter += jsonToFrontMatter(item, indent + 2); // Nested objects in array
            } else {
              frontMatter += `${indentation}- ${item}\n`;
            }
          });
        } else {
          // Primitive value (string, number, boolean, etc.)
          frontMatter += `${indentation}${key}: ${value}\n`;
        }
      }
    }

    return frontMatter;
  }

  return `---\n${jsonToFrontMatter(content)}---\n`;
}

export function getEnv(key: string) {
  if(process.env[key]) {
    return process.env[key];
  } 
  
  throw new Error(`Env not found: ${key}`);
}