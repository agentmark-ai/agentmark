import { createFileServer } from '../file-server';

const serveFiles = async (options: { port?: number } = {}) => {
  const port = options.port || 9418;
  await createFileServer(port);
};

export default serveFiles;
