import { POSITIONS, positionById } from '../core/catalog';
import type { GraphEdge } from '../core/stats';

const COL_W = 132;
const ROW_H = 54;
const NODE_W = 112;
const NODE_H = 30;
const PAD = 8;

const center = (id: string) => {
  const p = positionById(id)!;
  return { x: PAD + p.col * COL_W + NODE_W / 2, y: PAD + p.row * ROW_H + NODE_H / 2 };
};

/**
 * Positions laid out left to right (standing → guard → passing → dominant → submission). An edge
 * is drawn for every technique you've tagged that moves between two positions, thicker the more
 * sessions it's in. Positions you've noted getting stuck in get a dashed outline.
 */
export function graphSvg(edges: GraphEdge[], nodes: Map<string, number>, stuck: Set<string>): string {
  const cols = Math.max(...POSITIONS.map((p) => p.col)) + 1;
  const rows = Math.max(...POSITIONS.map((p) => p.row)) + 1;
  const w = PAD * 2 + (cols - 1) * COL_W + NODE_W;
  const h = PAD * 2 + (rows - 1) * ROW_H + NODE_H;
  const max = Math.max(1, ...edges.map((e) => e.n));
  const lines = edges
    .map((e) => {
      const a = center(e.from);
      const b = center(e.to);
      const sameCol = positionById(e.from)!.col === positionById(e.to)!.col;
      const x1 = a.x + (sameCol ? NODE_W / 2 : b.x > a.x ? NODE_W / 2 : -NODE_W / 2);
      const x2 = b.x + (sameCol ? NODE_W / 2 : b.x > a.x ? -NODE_W / 2 : NODE_W / 2);
      const bend = sameCol ? 40 : (x2 - x1) / 2;
      const d = `M${x1} ${a.y} C${x1 + bend} ${a.y}, ${x2 - (sameCol ? -40 : bend)} ${b.y}, ${x2} ${b.y}`;
      const width = 1.5 + (5 * e.n) / max;
      return `<path class="graph-edge${e.to === 'submission' ? ' sub' : ''}" d="${d}" stroke-width="${width.toFixed(1)}"><title>${e.techniques.join(', ')} · ${e.n} session${e.n === 1 ? '' : 's'}</title></path>`;
    })
    .join('');
  const boxes = POSITIONS.map((p) => {
    const x = PAD + p.col * COL_W;
    const y = PAD + p.row * ROW_H;
    const n = nodes.get(p.id);
    const cls = n ? 'on' : n === 0 ? 'stuck-only' : 'off';
    return `<g class="graph-node ${cls}${stuck.has(p.id) ? ' stuck' : ''}"><rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="8" /><text x="${x + NODE_W / 2}" y="${y + NODE_H / 2 + 4}" text-anchor="middle">${p.label}</text><title>${p.label}${n ? `: ${n} technique-sessions` : ''}${stuck.has(p.id) ? ' · noted as stuck' : ''}</title></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Position graph from your logged techniques">${lines}${boxes}</svg>`;
}
