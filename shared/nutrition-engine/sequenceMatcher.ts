/**
 * منفذ TypeScript لخوارزمية Python's difflib.SequenceMatcher(None, a, b).ratio() —
 * حرفيًا Ratcliff/Obershelp (أطول كتلة متطابقة متكررة)، وليست مكتبة تشابه نصوص عامة (مثل
 * Dice/Levenshtein) لأن عتبات fuzzy.py (0.55/0.70/0.90) مضبوطة تحديدًا على قيم difflib الحقيقية.
 *
 * قيد موثّق: لا يطبّق "autojunk" heuristic (تُفعَّل بـPython فقط لو len(b) >= 200 حرف —
 * تتجاهل حروف متكررة جدًا). أسماء/أسماء أطعمة مستعارة قصيرة دائمًا (أقل من 200 حرف)، فهذا القيد
 * لا يؤثر عمليًا — موثّق هنا بدل تجاهله بصمت.
 */

function buildB2J(b: string): Map<string, number[]> {
  const b2j = new Map<string, number[]>();
  for (let i = 0; i < b.length; i++) {
    const ch = b[i];
    let arr = b2j.get(ch);
    if (!arr) {
      arr = [];
      b2j.set(ch, arr);
    }
    arr.push(i);
  }
  return b2j;
}

function findLongestMatch(
  a: string, b: string, b2j: Map<string, number[]>,
  alo: number, ahi: number, blo: number, bhi: number,
): [number, number, number] {
  let besti = alo;
  let bestj = blo;
  let bestsize = 0;
  let j2len = new Map<number, number>();

  for (let i = alo; i < ahi; i++) {
    const newj2len = new Map<number, number>();
    const indices = b2j.get(a[i]);
    if (indices) {
      for (const j of indices) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (j2len.get(j - 1) ?? 0) + 1;
        newj2len.set(j, k);
        if (k > bestsize) {
          besti = i - k + 1;
          bestj = j - k + 1;
          bestsize = k;
        }
      }
    }
    j2len = newj2len;
  }

  while (besti > alo && bestj > blo && a[besti - 1] === b[bestj - 1]) {
    besti--; bestj--; bestsize++;
  }
  while (besti + bestsize < ahi && bestj + bestsize < bhi && a[besti + bestsize] === b[bestj + bestsize]) {
    bestsize++;
  }

  return [besti, bestj, bestsize];
}

function getMatchingBlocks(a: string, b: string): Array<[number, number, number]> {
  const b2j = buildB2J(b);
  const queue: Array<[number, number, number, number]> = [[0, a.length, 0, b.length]];
  const blocks: Array<[number, number, number]> = [];

  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop()!;
    const [i, j, k] = findLongestMatch(a, b, b2j, alo, ahi, blo, bhi);
    if (k > 0) {
      blocks.push([i, j, k]);
      if (alo < i && blo < j) queue.push([alo, i, blo, j]);
      if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
    }
  }

  blocks.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  return blocks;
}

/** يطابق Python's difflib.SequenceMatcher(None, a, b).ratio() حرفيًا لسلاسل قصيرة (راجع القيد أعلاه). */
export function sequenceMatcherRatio(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1.0;
  const blocks = getMatchingBlocks(a, b);
  const matches = blocks.reduce((sum, blk) => sum + blk[2], 0);
  return (2.0 * matches) / (a.length + b.length);
}
