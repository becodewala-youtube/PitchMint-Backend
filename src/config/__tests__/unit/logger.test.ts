import { redact } from '../../../config/logger';

describe('Logger Redaction Utility', () => {
  it('should not redact safe keys', () => {
    const input = { safe: 'value', another: 123 };
    const result = redact(input);
    expect(result).toEqual(input);
  });

  it('should redact sensitive keys case-insensitively', () => {
    const input = { password: 'secret123', API_KEY: 'key123', 'X-Auth-Token': 'tok' };
    const result = redact(input);
    expect(result.password).toBe('[REDACTED]');
    expect(result.API_KEY).toBe('[REDACTED]');
    expect(result['X-Auth-Token']).toBe('[REDACTED]');
  });

  it('should redact deeply nested sensitive properties', () => {
    const input = { user: { profile: { password: 'secret123' } } };
    const result = redact(input);
    expect(result.user.profile.password).toBe('[REDACTED]');
  });

  it('should handle arrays safely', () => {
    const input = { users: [{ password: 'p1' }, { safe: 's1' }] };
    const result = redact(input);
    expect(result.users[0].password).toBe('[REDACTED]');
    expect(result.users[1].safe).toBe('s1');
  });

  it('should handle circular structures safely without throwing', () => {
    const obj: any = { safe: 'yes' };
    obj.circular = obj;
    
    const result = redact(obj);
    expect(result.safe).toBe('yes');
    expect(result.circular).toBe('[CIRCULAR]');
  });

  it('should redact full request bodies', () => {
    const input = { body: { name: 'John', age: 30 } };
    const result = redact(input);
    expect(result.body).toBe('[REDACTED]');
  });
});
