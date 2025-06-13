import { AgentmarkConfig } from "./types";

export function toFrontMatter(content: { [key: string]: any }): string {
  function jsonToFrontMatter(json: { [key: string]: any }, indent = 0) {
    let frontMatter = "";
    const indentation = "  ".repeat(indent);

    for (const key in json) {
      if (json.hasOwnProperty(key)) {
        const value = json[key];

        if (typeof value === "object" && !Array.isArray(value)) {
          frontMatter += `${indentation}${key}:\n`;
          frontMatter += jsonToFrontMatter(value, indent + 1);
        } else if (Array.isArray(value)) {
          frontMatter += `${indentation}${key}:\n`;
          value.forEach((item) => {
            if (typeof item === "object") {
              frontMatter += `${indentation}-\n`;
              frontMatter += jsonToFrontMatter(item, indent + 2);
            } else {
              frontMatter += `${indentation}- ${item}\n`;
            }
          });
        } else {
          frontMatter += `${indentation}${key}: ${value}\n`;
        }
      }
    }

    return frontMatter;
  }

  return `---\n${jsonToFrontMatter(content)}---\n`;
}

export type SerializeParams = {
  name: string;
  prompt: {
    name: string;
    input: string;
    model: string;
    parameters?: any;
    variables?: { name: string; value: string }[];
    output?: any;
    input_schema?: any;
  };
  mdxVersion?: AgentmarkConfig["mdxVersion"];
  promptType?: string;
};

export const serialize = ({
  name,
  prompt,
  mdxVersion,
  promptType,
}: SerializeParams) => {
  let data: any = {};
  if (mdxVersion === "1.0") {
    const settings = {
      model_name: prompt.model,
      ...prompt.parameters,
    };
    if (promptType === "object") {
      data = {
        object_config: settings,
      };
    }

    if (promptType === "text") {
      data = {
        text_config: settings,
      };
    }

    if (promptType === "image") {
      data = {
        image_config: settings,
      };
    }

    if (promptType === "speech") {
      data = {
        speech_config: settings,
      };
    }
  } else {
    data = {
      metadata: {
        model: {
          name: prompt.model,
          settings: { ...prompt.parameters },
        },
      },
    };
  }

  if (prompt.input_schema) {
    data.input_schema = prompt.input_schema;
  }

  const promptDx = {
    name: name,
    ...data,
    test_settings: {
      props: prompt.variables
        ? prompt.variables.reduce(
            (acc: any, v: any) => ({ ...acc, [v.name]: v.value }),
            {}
          )
        : {},
    },
  } as any;

  const frontMatter = toFrontMatter(promptDx);

  const mdx = `${frontMatter}\n\n${prompt.input}`;

  return mdx;
};
