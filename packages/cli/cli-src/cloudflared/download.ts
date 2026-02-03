/**
 * Cloudflared Binary Download Module
 *
 * Handles downloading and installing the cloudflared binary with user consent.
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';
import prompts from 'prompts';
import { getPlatformInfo, getCacheDir, getBinaryPath } from './platform';

const GITHUB_RELEASE_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download';

/**
 * Ensures cloudflared binary is available, downloading if necessary.
 * Prompts for user consent before downloading.
 * @returns Path to the cloudflared binary
 * @throws Error if user declines download or download fails
 */
export async function ensureCloudflared(): Promise<string> {
  const binaryPath = getBinaryPath();

  // Check if binary already exists
  if (fs.existsSync(binaryPath)) {
    return binaryPath;
  }

  // Check if download should be skipped
  if (process.env.AGENTMARK_SKIP_CLOUDFLARED_DOWNLOAD === 'true') {
    throw new Error(
      'Cloudflared binary not found and automatic download is disabled.\n' +
      'Install cloudflared manually or set AGENTMARK_SKIP_CLOUDFLARED_DOWNLOAD=false'
    );
  }

  // Prompt for consent
  const { consent } = await prompts({
    type: 'confirm',
    name: 'consent',
    message: 'Cloudflared binary not found. Download it now? (~30MB)',
    initial: true
  });

  if (!consent) {
    throw new Error('Cloudflared binary required for tunnel. Run with --tunnel to try again.');
  }

  await downloadBinary();
  return binaryPath;
}

/**
 * Downloads the cloudflared binary for the current platform.
 */
async function downloadBinary(): Promise<void> {
  const { binaryName, isArchive } = getPlatformInfo();
  const cacheDir = getCacheDir();
  const downloadUrl = `${GITHUB_RELEASE_URL}/${binaryName}`;

  // Create cache directory
  fs.mkdirSync(cacheDir, { recursive: true });

  console.log(`Downloading cloudflared from ${downloadUrl}...`);

  const tempPath = path.join(cacheDir, binaryName);
  await downloadFile(downloadUrl, tempPath);

  if (isArchive) {
    // Extract .tgz on macOS
    console.log('Extracting archive...');
    execSync(`tar -xzf "${tempPath}" -C "${cacheDir}"`);
    fs.unlinkSync(tempPath);
  }

  // Set executable permission on Unix
  const binaryPath = getBinaryPath();
  if (process.platform !== 'win32') {
    fs.chmodSync(binaryPath, 0o755);
  }

  console.log('Cloudflared installed successfully.');
}

/**
 * Downloads a file from a URL, following redirects.
 * @param url URL to download from
 * @param dest Destination file path
 */
function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    const request = https.get(url, (response) => {
      // Follow redirects (GitHub uses 302 for release downloads)
      if (response.statusCode === 302 || response.statusCode === 301) {
        const redirectUrl = response.headers.location;
        if (!redirectUrl) {
          reject(new Error('Redirect without location header'));
          return;
        }
        file.close();
        fs.unlinkSync(dest);
        downloadFile(redirectUrl, dest).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });
    });

    request.on('error', (err) => {
      file.close();
      fs.unlink(dest, () => {}); // Delete partial file
      reject(new Error(`Download failed: ${err.message}`));
    });

    file.on('error', (err) => {
      file.close();
      fs.unlink(dest, () => {}); // Delete partial file
      reject(new Error(`File write failed: ${err.message}`));
    });
  });
}
