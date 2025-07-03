import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import os from 'os';

interface ImageFile {
  mimeType: string;
  base64: string;
}

interface AudioFile {
  mimeType: string;
  base64: string;
}

// HTML templates based on VSCode extension patterns
const createImageHtml = (images: ImageFile[], title: string = "Generated Images") => {
  if (!images.length) {
    return `
    <html>
      <head><title>${title}</title></head>
      <body style="margin:0;padding:20px;font-family:sans-serif;">
        <h1>No Generated Images</h1>
      </body>
    </html>`;
  }

  const imageListHtml = images
    .map((image, index) => `
      <div class="image-container" style="margin-bottom: 20px; border: 1px solid #ddd; padding: 15px; border-radius: 8px;">
        <h3>Image ${index + 1}</h3>
        <img src="data:${image.mimeType};base64,${image.base64}" 
             alt="Generated Image ${index + 1}" 
             style="max-width:100%;height:auto;border-radius:4px;" />
        <p style="color: #666; font-size: 0.9em; margin-top: 10px;">
          Type: ${image.mimeType} | Size: ${Math.round(image.base64.length * 0.75 / 1024)}KB
        </p>
      </div>
    `)
    .join('');

  return `
  <!DOCTYPE html>
  <html>
    <head>
      <title>${title}</title>
      <meta charset="utf-8">
      <style>
        body { margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; border-bottom: 2px solid #007acc; padding-bottom: 10px; }
        .image-container { background: #f9f9f9; }
        .image-container:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); transition: box-shadow 0.2s; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>${title}</h1>
        ${imageListHtml}
      </div>
    </body>
  </html>`;
};

const createAudioHtml = (audio: AudioFile, title: string = "Generated Audio") => {
  if (!audio) {
    return `
    <html>
      <head><title>${title}</title></head>
      <body style="margin:0;padding:20px;font-family:sans-serif;">
        <h1>No Generated Audio File</h1>
      </body>
    </html>`;
  }

  return `
  <!DOCTYPE html>
  <html>
    <head>
      <title>${title}</title>
      <meta charset="utf-8">
      <style>
        body { margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; border-bottom: 2px solid #007acc; padding-bottom: 10px; }
        .audio-container { background: #f9f9f9; padding: 20px; border-radius: 8px; border: 1px solid #ddd; }
        audio { width: 100%; margin: 10px 0; }
        .info { color: #666; font-size: 0.9em; margin-top: 15px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>${title}</h1>
        <div class="audio-container">
          <h3>Audio File</h3>
          <audio controls>
            <source src="data:${audio.mimeType};base64,${audio.base64}" type="${audio.mimeType}">
            Your browser does not support the audio element.
          </audio>
          <div class="info">
            Type: ${audio.mimeType} | Size: ${Math.round(audio.base64.length * 0.75 / 1024)}KB
          </div>
        </div>
      </div>
    </body>
  </html>`;
};

// Create temporary file and return path
const createTempFile = (content: string, extension: string = '.html'): string => {
  const tempDir = os.tmpdir();
  const fileName = `agentmark-${Date.now()}-${Math.random().toString(36).substr(2, 9)}${extension}`;
  const filePath = path.join(tempDir, fileName);
  
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
};

// Open file in default browser
const openInBrowser = (filePath: string): void => {
  const fileUrl = `file://${filePath}`;
  
  let command: string;
  let args: string[];
  
  switch (process.platform) {
    case 'darwin': // macOS
      command = 'open';
      args = [fileUrl];
      break;
    case 'win32': // Windows
      command = 'start';
      args = ['""', fileUrl]; // Empty title for start command
      break;
    default: // Linux and others
      command = 'xdg-open';
      args = [fileUrl];
      break;
  }

  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore'
    });
    
    child.unref(); // Allow parent process to exit independently
    
    console.log(`Opening in browser: ${fileUrl}`);
  } catch (error) {
    console.error('Failed to open browser:', error);
    console.log(`Please manually open: ${fileUrl}`);
  }
};

// Clean up temporary file after delay
const scheduleCleanup = (filePath: string, delayMs: number = 30000): void => {
  setTimeout(() => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      // Silently ignore cleanup errors
    }
  }, delayMs);
};

// Main functions to display content
export const displayImagesInBrowser = (images: ImageFile[], title?: string): void => {
  const html = createImageHtml(images, title);
  const tempFile = createTempFile(html);
  
  openInBrowser(tempFile);
  scheduleCleanup(tempFile);
};

export const displayAudioInBrowser = (audio: AudioFile, title?: string): void => {
  const html = createAudioHtml(audio, title);
  const tempFile = createTempFile(html);
  
  openInBrowser(tempFile);
  scheduleCleanup(tempFile);
};

// Functions to create files without auto-opening (for dataset tables)
export const createImageFile = (images: ImageFile[], title?: string): string => {
  const html = createImageHtml(images, title);
  const tempFile = createTempFile(html);
  scheduleCleanup(tempFile, 300000); // 5 minutes for dataset files
  return tempFile;
};

export const createAudioFile = (audio: AudioFile, title?: string): string => {
  const html = createAudioHtml(audio, title);
  const tempFile = createTempFile(html);
  scheduleCleanup(tempFile, 300000); // 5 minutes for dataset files
  return tempFile;
};

// Create clickable terminal link (fallback to plain path if ANSI not supported)
export const createClickableLink = (filePath: string, displayText?: string): string => {
  const fileUrl = `file://${filePath}`;
  const text = displayText || fileUrl;
  
  // ANSI escape sequence for clickable links: \033]8;;URL\033\\TEXT\033]8;;\033\\
  return `\x1b]8;;${fileUrl}\x1b\\${text}\x1b]8;;\x1b\\`;
};

// Print the file path outside the table for full visibility with clickable link
export const printFilePath = (filePath: string, description: string): void => {
  const fileUrl = `file://${filePath}`;
  const clickableLink = createClickableLink(filePath, "🔗 Click here to open in browser");
  
  console.log(`   ${description}`);
  console.log(`   ${clickableLink}`);
  console.log(`   📂 Path: ${filePath}`);
  console.log(`   💡 If the link above doesn't work, copy the path into your browser address bar\n`);
};

// Combined function for mixed content
export const displayMediaInBrowser = (content: {
  images?: ImageFile[];
  audio?: AudioFile;
  title?: string;
}): void => {
  const { images, audio, title = "Generated Media" } = content;
  
  if (images && images.length > 0) {
    displayImagesInBrowser(images, title);
  }
  
  if (audio) {
    displayAudioInBrowser(audio, title);
  }
};