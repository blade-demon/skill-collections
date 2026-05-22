import type { Warning } from '@skill-collections/d2c-core';
import type { SketchPage, SketchRawModel } from '../sketch-raw-model.js';
import {
  asSketchNode,
  getLayers,
  getNodeClass,
  getNodeId,
  getNodeName,
  getPageLayers,
  getPages,
  type SketchNode,
} from './sketch-nodes.js';

export interface SelectArtboardOptions {
  artboard?: string;
}

export interface SelectedArtboard {
  page: SketchPage;
  artboard: SketchNode;
  warnings: Warning[];
}

interface ArtboardCandidate {
  page: SketchPage;
  artboard: SketchNode;
}

function isSymbolLibraryPage(page: SketchPage): boolean {
  const layers = getPageLayers(page);
  return layers.length > 0 && layers.every((layer) => getNodeClass(layer) === 'symbolMaster');
}

function listArtboards(model: SketchRawModel): ArtboardCandidate[] {
  const candidates: ArtboardCandidate[] = [];
  for (const page of getPages(model)) {
    for (const layer of getPageLayers(page)) {
      const node = asSketchNode(layer);
      if (getNodeClass(node) === 'artboard') candidates.push({ page, artboard: node });
      for (const child of getLayers(node)) {
        if (getNodeClass(child) === 'artboard') candidates.push({ page, artboard: child });
      }
    }
  }
  return candidates;
}

function formatCandidates(candidates: ArtboardCandidate[]): string {
  return candidates
    .map(({ artboard }) => `${getNodeName(artboard)} (${getNodeId(artboard)})`)
    .join(', ');
}

export function selectArtboard(
  model: SketchRawModel,
  options: SelectArtboardOptions = {},
): SelectedArtboard {
  const warnings: Warning[] = [];
  const candidates = listArtboards(model);
  if (candidates.length === 0) {
    throw new Error('No Sketch artboard found in raw model');
  }

  if (options.artboard) {
    const matches = candidates.filter(
      ({ artboard }) =>
        getNodeId(artboard) === options.artboard || getNodeName(artboard) === options.artboard,
    );
    if (matches.length === 1) return { ...matches[0]!, warnings };
    if (matches.length > 1) {
      throw new Error(`Multiple artboards matched "${options.artboard}": ${formatCandidates(matches)}`);
    }
    throw new Error(`No artboard matched "${options.artboard}". Candidates: ${formatCandidates(candidates)}`);
  }

  const nonSymbolPageCandidates = candidates.filter(({ page }) => !isSymbolLibraryPage(page));
  const automatic = nonSymbolPageCandidates.length > 0 ? nonSymbolPageCandidates : candidates;
  if (automatic.length !== 1) {
    throw new Error(`Multiple artboards require --artboard: ${formatCandidates(automatic)}`);
  }
  return { ...automatic[0]!, warnings };
}
