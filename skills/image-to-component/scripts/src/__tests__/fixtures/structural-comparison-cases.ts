import type { BatchResult } from '../../types.js';

export const caseA: BatchResult = {
  batch: 'case-a',
  images: [
    {
      filename: 'pending.png',
      signature: {
        T: 'title -> meta',
        M: 'card(media + card(title -> meta -> meta) -> media)',
        B: 'hint -> action + hint',
        O: '-',
        F: '-',
      },
      notes: { divider: 'dashed' },
    },
    {
      filename: 'used.png',
      signature: {
        T: 'title -> meta',
        M: 'card(media + card(title -> meta -> meta) -> media -> status)',
        B: 'meta',
        O: '-',
        F: '-',
      },
      notes: { divider: 'dashed' },
    },
    {
      filename: 'expired.png',
      signature: {
        T: 'title -> meta',
        M: 'card(media + card(title -> meta -> meta) -> media -> status)',
        B: 'meta',
        O: '-',
        F: '-',
      },
      notes: { divider: 'dashed' },
    },
  ],
};

export const caseB: BatchResult = {
  batch: 'case-b',
  images: [
    {
      filename: 'list.png',
      signature: {
        T: 'nav',
        M: 'list(card(title -> meta + status))',
        B: 'nav',
        O: '-',
        F: '-',
      },
      notes: {},
    },
    {
      filename: 'detail.png',
      signature: {
        T: 'nav',
        M: 'title -> meta -> media -> status -> form',
        B: 'action + action',
        O: '-',
        F: '-',
      },
      notes: {},
    },
  ],
};

export const caseC: BatchResult = {
  batch: 'case-c',
  images: [
    {
      filename: 'normal.png',
      signature: {
        T: 'nav',
        M: 'title -> meta -> media -> form',
        B: 'action + action',
        O: '-',
        F: '-',
      },
      notes: {},
    },
    {
      filename: 'confirm-modal.png',
      signature: {
        T: 'nav',
        M: 'title -> meta -> media -> form',
        B: 'action + action',
        O: 'card(title -> meta -> action + action)',
        F: '-',
      },
      notes: { overlay_type: 'modal' },
    },
  ],
};

export const caseD: BatchResult = {
  batch: 'case-d',
  images: [
    {
      filename: 'idle.png',
      signature: {
        T: 'title -> meta',
        M: 'form(form -> form -> action)',
        B: 'hint',
        O: '-',
        F: '-',
      },
      notes: {},
    },
    {
      filename: 'error.png',
      signature: {
        T: 'title -> meta',
        M: 'form(form -> form -> hint -> action)',
        B: 'hint',
        O: '-',
        F: '-',
      },
      notes: {},
    },
  ],
};

export const caseE: BatchResult = {
  batch: 'case-e',
  images: [
    {
      filename: 'empty.png',
      signature: { T: 'nav', M: 'empty', B: 'action', O: '-', F: '-' },
      notes: {},
    },
    {
      filename: 'filled.png',
      signature: {
        T: 'nav',
        M: 'list(card(title -> meta))',
        B: 'action',
        O: '-',
        F: '-',
      },
      notes: {},
    },
  ],
};
