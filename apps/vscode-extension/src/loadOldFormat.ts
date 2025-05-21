import { load, getFrontMatter} from '@agentmark/templatedx';
import { dump } from 'js-yaml';

export const loadOldFormat = async ({ file }: { file: string }) => {
    const loadedFile = await load(file);
    const frontMatter: any = getFrontMatter(loadedFile);
  
    const objectConfig = frontMatter?.metadata?.model?.settings?.schema;
    const settings = frontMatter?.metadata?.model?.settings || {};
    const { metadata, ...rest } = frontMatter;
  
    const newModelConfig = {
    ...rest,
    ...{
      ...(objectConfig && {
        object_config: {
          model_name: frontMatter.metadata.model.name,
          schema: objectConfig,
          ...settings,
        }
      }),
      ...(!objectConfig && {
        text_config: {
          model_name: frontMatter.metadata.model.name,
          ...settings,
        }
      }),
    }};
  
    const yamlNodeIndex = loadedFile.children.findIndex((node) => node.type === 'yaml');
    if (yamlNodeIndex !== -1) {
      loadedFile.children[yamlNodeIndex] = {
        type: 'yaml',
        value: dump(newModelConfig),
        position: loadedFile.children[yamlNodeIndex].position,
      };
    }  

    return loadedFile;
  };