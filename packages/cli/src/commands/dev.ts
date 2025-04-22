import { execSync } from "child_process";
import dotenv from "dotenv";

type Options = {
  port: number
}

const dev = ({port}: Options) => {
  const currentProjectPath = process.cwd();
  console.log("Starting agentmark development server...");

  dotenv.config({
    path: `${currentProjectPath}/.env`,
  });

  execSync(`export ROOT_AGENTMARK_PROJECT_PATH=${currentProjectPath} && npm start -- -p ${port}`, {
    cwd: __dirname,
  });
  console.log("Development server ready on port 9001");
};

export default dev;
