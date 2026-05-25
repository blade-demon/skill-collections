import { describe, expect, it } from 'vitest';

import {
  evidenceFromAnnotation,
  evidenceFromDesignIrCandidate,
  evidenceFromProjectRule,
  evidenceFromVisualNode,
} from '../evidence';
import { SemanticEvidenceSchema } from '../schema';

describe('evidence constructors', () => {
  it('evidenceFromVisualNode returns a parseable visual-node evidence', () => {
    const e = evidenceFromVisualNode('v_1', 'root frame');
    expect(e).toEqual({ kind: 'visual-node', nodeId: 'v_1', reason: 'root frame' });
    expect(SemanticEvidenceSchema.safeParse(e).success).toBe(true);
  });

  it('evidenceFromDesignIrCandidate returns a parseable design-ir-candidate evidence', () => {
    const e = evidenceFromDesignIrCandidate('Hero', 'v_2', 'matched name prefix');
    expect(e).toEqual({
      kind: 'design-ir-candidate',
      candidateName: 'Hero',
      nodeId: 'v_2',
      reason: 'matched name prefix',
    });
    expect(SemanticEvidenceSchema.safeParse(e).success).toBe(true);
  });

  it('evidenceFromAnnotation returns a parseable annotation evidence', () => {
    const e = evidenceFromAnnotation('@component', 'v_3', 'designer-marked');
    expect(e).toEqual({
      kind: 'annotation',
      annotationKey: '@component',
      nodeId: 'v_3',
      reason: 'designer-marked',
    });
    expect(SemanticEvidenceSchema.safeParse(e).success).toBe(true);
  });

  it('evidenceFromProjectRule returns a parseable project-rule evidence', () => {
    const e = evidenceFromProjectRule('prefix-comp', 'matched /Component prefix');
    expect(e).toEqual({
      kind: 'project-rule',
      ruleName: 'prefix-comp',
      reason: 'matched /Component prefix',
    });
    expect(SemanticEvidenceSchema.safeParse(e).success).toBe(true);
  });
});
