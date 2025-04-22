import { toFrontMatter } from "@puzzlet/agentmark";

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
