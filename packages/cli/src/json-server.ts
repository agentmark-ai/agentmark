// Re-export for backward compatibility
export { createFileServer } from '@agentmark/sdk/file-server';

// When run directly as a script
if (require.main === module) {
  const { createFileServer } = require('@agentmark/sdk/file-server');
  const PORT = parseInt(process.env.PORT || '9418', 10);
  createFileServer(PORT).catch((error: Error) => {
    console.error('Failed to start file server:', error);
    process.exit(1);
  });
}
