import { describe, expect, it } from 'vitest'
import { ROUTE_MODES, classifyTurn, renderRouteContext } from '../src/classify.ts'

describe('classifyTurn', () => {
  it('把报错修复类请求判为正确性模式', () => {
    const verdict = classifyTurn('这个构建报错了，帮我修复一下')
    expect(verdict.mode).toBe('correct')
    expect(verdict.score).toBeGreaterThan(0)
    expect(verdict.matched).toContain('报错')
  })

  it('把视觉交互类请求判为体验模式', () => {
    const verdict = classifyTurn('左侧栏的间距和颜色不太好看，动效也太生硬')
    expect(verdict.mode).toBe('experience')
    expect(verdict.matched.length).toBeGreaterThan(0)
  })

  it('把对比评估类请求判为研究模式', () => {
    const verdict = classifyTurn('这两个方案怎么选？帮我比较一下权衡')
    expect(verdict.mode).toBe('research')
  })

  it('英文混写同样可判', () => {
    expect(classifyTurn('please fix this build error').mode).toBe('correct')
    expect(classifyTurn('compare these two layout approaches').mode).toBe('research')
  })

  it('零命中时回落到正确性且分数为零', () => {
    const verdict = classifyTurn('你好')
    expect(verdict.mode).toBe('correct')
    expect(verdict.score).toBe(0)
    expect(verdict.matched).toEqual([])
  })

  it('平局时按 研究 → 体验 的优先级裁决', () => {
    // 一条命中研究、一条命中体验，各 1 分
    const verdict = classifyTurn('调研一下这个动效')
    expect(verdict.mode).toBe('research')
  })
})

describe('renderRouteContext', () => {
  it('注入文本包含模式名、重心与要求三部分', () => {
    const text = renderRouteContext(classifyTurn('修复构建报错'))
    expect(text).toContain('本轮模式路由')
    expect(text).toContain(ROUTE_MODES.correct.name)
    expect(text).toContain('验收重心：')
    expect(text).toContain('要求：')
  })

  it('零命中时说明依据缺失', () => {
    const text = renderRouteContext(classifyTurn('继续'))
    expect(text).toContain('无关键词命中')
  })

  it('命中关键词时把依据写进注入文本，便于事后复核', () => {
    const text = renderRouteContext(classifyTurn('帮我对比这两个接口方案'))
    expect(text).toMatch(/关键词：/)
  })
})
