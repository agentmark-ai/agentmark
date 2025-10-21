const serveFiles = async (options: { port?: number } = {}) => {
  const port = options.port || 9418;

  // Use SDK's file server which has all the endpoints
  const { createFileServer } = await import('@agentmark/sdk/file-server');
  await createFileServer(port);
};

export default serveFiles;
