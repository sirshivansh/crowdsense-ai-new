import { describe, it, expect } from 'vitest';
import { Security } from '../src/utils/security';

describe('Security Utility', () => {
  it('should sanitize HTML tags to prevent XSS', () => {
    const raw = '<script>alert("xss")</script>';
    const clean = Security.sanitize(raw);
    expect(clean).not.toContain('<script>');
    expect(clean).toContain('&lt;script&gt;');
  });

  it('should escape quotes and common injection characters', () => {
    const raw = "'; DROP TABLE users; --";
    const clean = Security.sanitize(raw);
    expect(clean).toContain('&#x27;');
    expect(clean).not.toContain("'");
  });

  it('should validate dropdown selections correctly', () => {
    const allowed = ['gate-a', 'gate-b', 'stadium-main'];
    expect(Security.isValidSelection('gate-a', allowed)).toBe(true);
    expect(Security.isValidSelection('malicious-id', allowed)).toBe(false);
  });

  it('should return an empty string for non-string inputs', () => {
    expect(Security.sanitize(null)).toBe('');
    expect(Security.sanitize(undefined)).toBe('');
    expect(Security.sanitize(123)).toBe('');
  });
});
