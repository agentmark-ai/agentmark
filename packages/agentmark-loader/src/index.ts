import * as webpack from "webpack";
import path from "path";
import { parse } from "@puzzlet/templatedx";
import fs from "fs";

async function promptdxLoader(
  this: webpack.LoaderContext<{}>,
  content: string
) {
  const callback = this.async();
  const baseDir = path.dirname(this.resourcePath);
  try {
    const ast = await parse(content, baseDir, async (modulePath) => {
      const content = await fs.promises.readFile(modulePath, 'utf-8');
      return content;
    });

    return callback(null, `export default ${JSON.stringify(ast)};`);
  } catch (error: any) {
    console.error(error);
    return callback(error);
  }
}

module.exports = promptdxLoader;