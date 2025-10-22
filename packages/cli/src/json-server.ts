// Re-export for backward compatibility
export { createFileServer } from './file-server';

// When run directly as a script
if (require.main === module) {
  import('./file-server.js').then(({ createFileServer }) => {
    const PORT = parseInt(process.env.PORT || '9418', 10);
    createFileServer(PORT).catch((error: Error) => {
      console.error('Failed to start file server:', error);
      process.exit(1);
    });
  });
}
