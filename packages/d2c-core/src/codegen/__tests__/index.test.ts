import { describe, expect, it } from 'vitest';

import * as codegen from '../index';

describe('codegen public surface (6-PR-1)', () => {
  it('exports the Gate 2 sign-off and input-validation entry points', () => {
    expect(typeof codegen.approveComponentPlan).toBe('function');
    expect(typeof codegen.verifyDesignSpec).toBe('function');
  });

  it('exports the codegen entry point (6-PR-2)', () => {
    expect(typeof codegen.generateComponentPackage).toBe('function');
  });
});
