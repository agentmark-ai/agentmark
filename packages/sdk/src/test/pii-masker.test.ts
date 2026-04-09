import { describe, it, expect } from 'vitest';
import { createPiiMasker } from '../trace/pii-masker';

describe('createPiiMasker', () => {
  it('should replace email addresses with [EMAIL]', () => {
    const mask = createPiiMasker({ email: true });
    const result = mask('Contact john.doe@example.com for details');
    expect(result).toBe('Contact [EMAIL] for details');
  });

  it('should replace phone numbers with [PHONE]', () => {
    const mask = createPiiMasker({ phone: true });
    const result = mask('Call (555) 123-4567 or +1-555-987-6543');
    expect(result).toBe('Call [PHONE] or [PHONE]');
  });

  it('should replace SSNs with [SSN]', () => {
    const mask = createPiiMasker({ ssn: true });
    const result = mask('SSN: 123-45-6789');
    expect(result).toBe('SSN: [SSN]');
  });

  it('should replace credit card numbers with [CREDIT_CARD]', () => {
    const mask = createPiiMasker({ creditCard: true });
    const result = mask('Card: 4111 1111 1111 1111');
    expect(result).toBe('Card: [CREDIT_CARD]');
  });

  it('should replace IP addresses with [IP_ADDRESS]', () => {
    const mask = createPiiMasker({ ipAddress: true });
    const result = mask('Server at 192.168.1.100');
    expect(result).toBe('Server at [IP_ADDRESS]');
  });

  it('should replace all occurrences when multiple matches exist', () => {
    const mask = createPiiMasker({ email: true });
    const result = mask('Send to alice@test.com and bob@test.com');
    expect(result).toBe('Send to [EMAIL] and [EMAIL]');
  });

  it('should replace multiple PII types in the same string', () => {
    const mask = createPiiMasker({ email: true, phone: true });
    const result = mask('Email jane@example.com or call 555-123-4567');
    expect(result).toBe('Email [EMAIL] or call [PHONE]');
  });

  it('should apply custom regex patterns', () => {
    const mask = createPiiMasker({
      custom: [{ pattern: /MRN-\d+/g, replacement: '[MRN]' }],
    });
    const result = mask('Patient MRN-12345');
    expect(result).toBe('Patient [MRN]');
  });

  it('should apply both custom and built-in patterns', () => {
    const mask = createPiiMasker({
      email: true,
      custom: [{ pattern: /MRN-\d+/g, replacement: '[MRN]' }],
    });
    const result = mask('Patient MRN-12345 contact doc@hospital.org');
    expect(result).toBe('Patient [MRN] contact [EMAIL]');
  });

  it('should return data unchanged when no patterns are enabled', () => {
    const mask = createPiiMasker({});
    const input = 'No PII here, just plain text with john@example.com';
    expect(mask(input)).toBe(input);
  });

  it('should work with only custom patterns and no built-in patterns enabled', () => {
    const mask = createPiiMasker({
      custom: [
        { pattern: /ACCT-\d+/g, replacement: '[ACCOUNT]' },
        { pattern: /MRN-\d+/g, replacement: '[MRN]' },
      ],
    });
    const result = mask('Records ACCT-999 and MRN-12345');
    expect(result).toBe('Records [ACCOUNT] and [MRN]');
  });
});
