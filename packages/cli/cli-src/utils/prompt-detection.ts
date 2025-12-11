/**
 * Shared utilities for detecting prompt types from file content.
 */

/**
 * Detect prompt type from raw file content by scanning frontmatter.
 * This allows us to choose the correct parser before full parsing.
 */
export function detectPromptTypeFromContent(content: string): 'language' | 'image' | 'speech' {
  // Simple detection by looking for config keys in frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return 'language'; // Default to language if no frontmatter
  }

  const frontmatter = frontmatterMatch[1];
  if (frontmatter.includes('image_config:')) return 'image';
  if (frontmatter.includes('speech_config:')) return 'speech';
  return 'language'; // text_config and object_config use language parser
}
