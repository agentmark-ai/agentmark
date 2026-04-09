import type { MaskFunction } from './masking-processor';

export interface PiiMaskerConfig {
  email?: boolean;
  phone?: boolean;
  ssn?: boolean;
  creditCard?: boolean;
  ipAddress?: boolean;
  custom?: Array<{ pattern: RegExp; replacement: string }>;
}

interface PatternEntry {
  regex: RegExp;
  replacement: string;
}

const PATTERNS: Record<string, PatternEntry> = {
  email: {
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: '[EMAIL]',
  },
  phone: {
    regex: /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    replacement: '[PHONE]',
  },
  ssn: {
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[SSN]',
  },
  creditCard: {
    regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    replacement: '[CREDIT_CARD]',
  },
  ipAddress: {
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    replacement: '[IP_ADDRESS]',
  },
};

// Order matters: longer/more-specific patterns first to prevent partial matches
// (e.g., credit card must run before phone, or the phone regex eats 10 digits of a CC number)
const PATTERN_ORDER: Array<keyof PiiMaskerConfig> = ['creditCard', 'ssn', 'email', 'phone', 'ipAddress'];

export function createPiiMasker(config: PiiMaskerConfig): MaskFunction {
  const activePatterns: PatternEntry[] = [];

  for (const key of PATTERN_ORDER) {
    if (config[key] && PATTERNS[key]) {
      activePatterns.push(PATTERNS[key]);
    }
  }

  if (config.custom) {
    for (const entry of config.custom) {
      activePatterns.push({ regex: entry.pattern, replacement: entry.replacement });
    }
  }

  return (data: string): string => {
    let result = data;
    for (const { regex, replacement } of activePatterns) {
      const fresh = new RegExp(regex.source, regex.flags);
      result = result.replace(fresh, replacement);
    }
    return result;
  };
}
