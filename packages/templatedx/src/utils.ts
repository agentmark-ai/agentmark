// Check if path is a Windows absolute path (e.g., C:\, D:\)
function isWindowsAbsolutePath(p: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(p);
}

export function resolvePath(basePath: string, targetPath: string): string {
  // Handle absolute paths (Unix or Windows)
  if (targetPath.startsWith('/') || isWindowsAbsolutePath(targetPath)) {
    return targetPath;
  }

  // Normalize path separators for processing
  const normalizedBase = basePath.replace(/\\/g, '/');
  const normalizedTarget = targetPath.replace(/\\/g, '/');

  // Check if base path is a Windows absolute path
  const windowsDrive = normalizedBase.match(/^([a-zA-Z]:)/);
  const prefix = windowsDrive ? windowsDrive[1] : '';
  const baseWithoutDrive = windowsDrive ? normalizedBase.slice(2) : normalizedBase;

  const baseParts = baseWithoutDrive.split('/').filter(Boolean);
  const targetParts = normalizedTarget.split('/').filter(Boolean);

  for (const part of targetParts) {
    if (part === '.') continue;
    if (part === '..') {
      baseParts.pop();
    } else {
      baseParts.push(part);
    }
  }

  // Return with appropriate prefix
  if (prefix) {
    return prefix + '/' + baseParts.join('/');
  }
  return '/' + baseParts.join('/');
}

export function getDirname(filePath: string): string {
  // Normalize path separators
  const normalizedPath = filePath.replace(/\\/g, '/');

  // Check if path is a Windows absolute path
  const windowsDrive = normalizedPath.match(/^([a-zA-Z]:)/);
  const prefix = windowsDrive ? windowsDrive[1] : '';
  const pathWithoutDrive = windowsDrive ? normalizedPath.slice(2) : normalizedPath;

  const parts = pathWithoutDrive.split('/').filter(Boolean);
  parts.pop();

  // Return with appropriate prefix
  if (prefix) {
    return prefix + '/' + parts.join('/');
  }
  return '/' + parts.join('/');
}

export function cloneObject(obj: any): any {
  return JSON.parse(JSON.stringify(obj));
}

export function stringifyValue(value: any): string {
  if (Array.isArray(value)) {
    return value.join('');
  } else if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  } else {
    return String(value);
  }
}