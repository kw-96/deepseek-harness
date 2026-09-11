/** 泳道图算法：线性历史、合并与并行分支的列分配。 */

import { describe, expect, it } from 'vitest'
import type { GitCommit } from '../src/types.js'
import { computeGraph } from '../src/client/graph-lanes.js'

function commit(hash: string, parents: readonly string[]): GitCommit {
  return { hash, shortHash: hash.slice(0, 4), parents, subject: hash, author: 'dev', date: '2026-09-11 10:00:00 +0800', refs: '' }
}

describe('computeGraph', () => {
  it('keeps a linear history in one lane', () => {
    const rows = computeGraph([commit('c', ['b']), commit('b', ['a']), commit('a', [])])
    expect(rows.map(row => row.lane)).toEqual([0, 0, 0])
    expect(rows.every(row => !row.merge)).toBe(true)
    expect(rows.at(-1)?.columns).toEqual([0])
  })

  it('opens a second lane for the merged branch and folds it back', () => {
    const rows = computeGraph([
      commit('A', ['B', 'C']),
      commit('B', ['D']),
      commit('C', ['D']),
      commit('D', []),
    ])
    expect(rows[0]?.merge).toBe(true)
    expect(rows[0]?.lane).toBe(0)
    expect(rows[0]?.columns).toEqual([0, 1])
    expect(rows[2]?.lane).toBe(1)
    // 两条分支在 D 处汇合，之后只剩一条泳道。
    expect(rows[3]?.lane).toBe(0)
    expect(rows[3]?.columns).toEqual([0])
  })

  it('clamps lanes past the drawing limit instead of growing without bound', () => {
    const history: GitCommit[] = [commit('tip', ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'])]
    const rows = computeGraph(history)
    expect(rows[0]?.lane).toBe(0)
    expect(Math.max(...(rows[0]?.columns ?? []))).toBeLessThanOrEqual(4)
  })
})
