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
    output?: {
      data: string;
    } & Record<string, any>;
  };
};

export const serialize = ({ name, prompt }: SerializeParams) => {
  const promptDx = {
    name: name,
    metadata: {
      model: {
        name: prompt.model,
        settings: { ...prompt.parameters },
      },
    },
    test_settings: {
      props: prompt.variables
        ? prompt.variables.reduce(
            (acc: any, v: any) => ({ ...acc, [v.name]: v.value }),
            {}
          )
        : {},
    },
  } as any;

  const frontMatter = toFrontMatter({
    name: promptDx.name,
    metadata: promptDx.metadata,
    test_settings: promptDx.test_settings,
  });

  const mdx = `${frontMatter}\n\n${prompt.input}`;

  return mdx;
};
