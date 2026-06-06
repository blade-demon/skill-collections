import { describe, expect, it } from 'vitest';

import { generateComponentPackage } from '../generate';
import {
  approvedCodegenInput as codegenInput,
  approvedMixedTextMediaInput,
  approvedStyledCardInput,
} from './codegen-fixtures';

describe('generateComponentPackage — presentational React', () => {
  it('returns a deterministic file plan with sorted, unique paths', () => {
    const a = generateComponentPackage(codegenInput());
    const b = generateComponentPackage(codegenInput());

    expect(a.files.length).toBeGreaterThan(0);
    expect(a).toEqual(b);

    const paths = a.files.map((f) => f.path);
    expect(paths).toEqual([...paths].sort());
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('emits one component .tsx per planned component', () => {
    const input = codegenInput();
    const plan = generateComponentPackage(input);
    const tsx = plan.files.filter((f) => f.path.endsWith('.tsx'));
    expect(tsx).toHaveLength(input.componentPlan.body.components.length);
  });

  it('emits package.json, README.md and interaction-coverage.md at the package root', () => {
    const paths = generateComponentPackage(codegenInput()).files.map((f) => f.path);
    expect(paths).toContain('package.json');
    expect(paths).toContain('README.md');
    expect(paths).toContain('interaction-coverage.md');
  });

  it('emits a src/index.ts barrel', () => {
    const paths = generateComponentPackage(codegenInput()).files.map((f) => f.path);
    expect(paths).toContain('src/index.ts');
  });

  it('returns a deterministic, outputPath-sorted asset copy plan', () => {
    const a = generateComponentPackage(approvedMixedTextMediaInput());
    const b = generateComponentPackage(approvedMixedTextMediaInput());

    expect(a.assets).toEqual(b.assets);
    expect(a.assets.length).toBeGreaterThan(0);

    const paths = a.assets.map((asset) => asset.outputPath);
    expect(paths).toEqual([...paths].sort());
    // One entry per unique assetRef.
    expect(new Set(a.assets.map((asset) => asset.assetRef)).size).toBe(a.assets.length);
  });

  it('emits no asset copy plan when the plan has no media assets', () => {
    expect(generateComponentPackage(approvedStyledCardInput()).assets).toEqual([]);
  });
});
