import { describe, it, expect } from 'vitest';
import { ENGINE_VERSION } from './index';

describe('Engine', () => {
  it('Foundation·smoke: engine module exports a version', () => {
    expect(ENGINE_VERSION).toBeDefined();
    expect(typeof ENGINE_VERSION).toBe('string');
  });
});
