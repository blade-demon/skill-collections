import { describe, it, expect } from 'vitest';
import { generateVue3 } from '../lib/skeleton/vue3.js';
import type { SkeletonConfig } from '../types.js';

const baseConfig: SkeletonConfig = {
  framework: 'vue3',
  lang: 'ts',
  style: 'css-modules',
  rootComponent: {
    name: 'FundPage',
    element: 'section',
    discriminator: {
      propName: 'fundType',
      type: 'FundType',
      variants: ['equity', 'bond', 'mixed'],
    },
    props: [{ name: 'title', type: 'string', required: true }],
    children: [{ name: 'FundHeader', element: 'header', props: [], children: [] }],
  },
};

describe('generateVue3 TS CSS Modules', () => {
  const files = generateVue3(baseConfig);

  it('produces root .vue with script setup lang="ts"', () => {
    const root = files.find((f) => f.path === 'FundPage.vue');
    expect(root).toBeDefined();
    expect(root!.content).toContain('<script setup lang="ts">');
    expect(root!.content).toContain('defineProps<{');
    expect(root!.content).toContain('fundType: FundType');
    expect(root!.content).toContain('useCssModule()');
    expect(root!.content).toContain('<style module>');
    expect(root!.content).toContain('<FundHeader');
  });

  it('produces child .vue files', () => {
    expect(files.find((f) => f.path === 'components/FundHeader.vue')).toBeDefined();
  });

  it('produces types.ts with discriminator union', () => {
    const types = files.find((f) => f.path === 'types.ts');
    expect(types).toBeDefined();
    expect(types!.content).toContain("export type FundType = 'equity' | 'bond' | 'mixed'");
  });

  it('produces index.ts', () => {
    expect(files.find((f) => f.path === 'index.ts')).toBeDefined();
  });
});

describe('generateVue3 JS BEM', () => {
  const jsConfig: SkeletonConfig = { ...baseConfig, lang: 'js', style: 'bem' };
  const files = generateVue3(jsConfig);

  it('produces root .vue without lang="ts"', () => {
    const root = files.find((f) => f.path === 'FundPage.vue');
    expect(root!.content).toContain('<script setup>');
    expect(root!.content).not.toContain('lang="ts"');
  });

  it('uses BEM class binding', () => {
    const root = files.find((f) => f.path === 'FundPage.vue');
    expect(root!.content).toContain('fund-page');
  });

  it('does not produce <style module>', () => {
    const root = files.find((f) => f.path === 'FundPage.vue');
    expect(root!.content).not.toContain('<style module>');
  });
});
