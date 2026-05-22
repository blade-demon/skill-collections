import { describe, it, expect } from 'vitest';
import { generateVue2 } from '../lib/skeleton/vue2.js';
import type { SkeletonConfig } from '../types.js';

const baseConfig: SkeletonConfig = {
  framework: 'vue2',
  lang: 'ts',
  style: 'css-modules',
  rootComponent: {
    name: 'IndexPage',
    element: 'div',
    props: [{ name: 'items', type: 'string[]', required: true }],
    children: [],
  },
};

describe('generateVue2 CSS Modules', () => {
  const files = generateVue2(baseConfig);

  it('produces root .vue with options API', () => {
    const root = files.find((f) => f.path === 'IndexPage.vue');
    expect(root).toBeDefined();
    expect(root!.content).toContain('export default');
    expect(root!.content).toContain('props:');
    expect(root!.content).toContain('<style module>');
    expect(root!.content).toContain('$style');
  });
});

describe('generateVue2 BEM', () => {
  const bemConfig: SkeletonConfig = { ...baseConfig, style: 'bem' };
  const files = generateVue2(bemConfig);

  it('uses BEM class names via computed', () => {
    const root = files.find((f) => f.path === 'IndexPage.vue');
    expect(root!.content).toContain('index-page');
  });

  it('does not use $style', () => {
    const root = files.find((f) => f.path === 'IndexPage.vue');
    expect(root!.content).not.toContain('$style');
  });
});
