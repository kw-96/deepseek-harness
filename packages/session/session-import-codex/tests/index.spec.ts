import { homedir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { loadCodexThreads } from '../src/sqlite.ts'
import {
  DEFAULT_MAX_TITLE_CHARS,
  DEFAULT_MAX_TOOL_RESULT_CHARS,
  apply,
  resolveConfig,
  runImportSweep,
  type ResolvedConfig,
} from '../src/index.ts'

vi.mock('../src/sqlite.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/sqlite.ts')>()
  return { ...actual, loadCodexThreads: vi.fn(actual.loadCodexThreads) }
})

const mockedLoad = vi.mocked(loadCodexThreads)

/** A persistence double that rejects every operation (unused in these tests). */
const unusablePersistence = {
  async create(): Promise<never> { throw new Error('unused create') },
  async open(): Promise<never> { throw new Error('unused open') },
  async stat(): Promise<undefined> { return undefined },
  async list(): Promise<readonly []> { return [] },
  async flush(): Promise<void> {},
} as unknown as NonNullable<Context['sessionPersistence']>

function testContext(): Context {
  const ctx = new Context()
  void new SessionStore(ctx)
  ctx.provide('sessionPersistence', unusablePersistence)
  return ctx
}

/** Minimal settings double: installSection drives apply's setSource/onChange. */
function makeFakeSettings(): { service: unknown; setAutoSync(value: boolean): void } {
  let autoSync = true
  let onChange: (() => void) | undefined
  const service = {
    installSection(
      _owner: unknown,
      _ns: string,
      _schema: unknown,
      _entry: { autoSync: boolean },
      hooks: { setSource: (source: () => { autoSync: boolean }) => void; onChange: () => void },
    ): void {
      onChange = hooks.onChange
      hooks.setSource(() => ({ autoSync }))
      hooks.onChange()
    },
    get(): { autoSync: boolean } {
      return { autoSync }
    },
  }
  return {
    service,
    setAutoSync(value: boolean) {
      autoSync = value
      onChange?.()
    },
  }
}

const contexts: Context[] = []

afterEach(async () => {
  mockedLoad.mockReset()
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

describe('resolveConfig', () => {
  it('resolves codexHome from the config, then CODEX_HOME, then the home directory', () => {
    expect(resolveConfig({ codexHome: 'C:\\explicit' }, {}).codexHome).toBe('C:\\explicit')
    expect(resolveConfig({}, { CODEX_HOME: 'C:\\env-home' }).codexHome).toBe('C:\\env-home')
    expect(resolveConfig({}, {}).codexHome).toBe(join(homedir(), '.codex'))
  })

  it('defaults cwd to the process cwd and applies the default caps', () => {
    const resolved = resolveConfig({}, {})
    expect(resolved.cwd).toBe(process.cwd())
    expect(resolved.bounds).toEqual({
      maxToolResultChars: DEFAULT_MAX_TOOL_RESULT_CHARS,
      maxTitleChars: DEFAULT_MAX_TITLE_CHARS,
    })
  })

  it('keeps an explicit cwd and caps, and rejects a relative cwd', () => {
    const resolved = resolveConfig({ cwd: 'C:\\work', maxTitleChars: 5, maxToolResultChars: 7 }, {})
    expect(resolved.cwd).toBe('C:\\work')
    expect(resolved.bounds).toEqual({ maxToolResultChars: 7, maxTitleChars: 5 })
    expect(() => resolveConfig({ cwd: 'relative' }, {})).toThrow(/cwd must be an absolute path/)
  })
})

describe('apply', () => {
  it('runs one sweep and logs the summary', async () => {
    const ctx = testContext()
    contexts.push(ctx)
    const info = vi.spyOn(ctx.logger, 'info')
    apply(ctx, { codexHome: 'C:\\no-store-anywhere' })
    await vi.waitFor(() => {
      expect(info).toHaveBeenCalledWith(
        expect.stringContaining('sweep finished (imported 0, skipped 0 existing, skipped 0 empty)'),
      )
    })
    await ctx.fiber.dispose()
    contexts.splice(contexts.indexOf(ctx), 1)
  })

  it('warns and counts nothing when the store read fails', async () => {
    const ctx = testContext()
    contexts.push(ctx)
    const warn = vi.spyOn(ctx.logger, 'warn')
    mockedLoad.mockRejectedValueOnce(new Error('locked'))
    const result = await runImportSweep(
      ctx,
      resolveConfig({ codexHome: 'C:\\boom' }, {}),
      new AbortController().signal,
    )
    expect(result.summary).toEqual({ imported: 0, skippedExisting: 0, skippedEmpty: 0 })
    expect(result.sessions).toEqual([])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not read the Codex thread store'))
  })

  it('stops at the abort boundary when a sweep is cancelled', async () => {
    const ctx = testContext()
    contexts.push(ctx)
    const config: ResolvedConfig = {
      codexHome: 'C:\\anywhere',
      cwd: process.cwd(),
      bounds: { maxToolResultChars: 100, maxTitleChars: 10 },
      syncIntervalMs: 0,
    }
    mockedLoad.mockResolvedValueOnce([
      { threadId: 't1', items: [], turns: [] },
    ])
    const result = await runImportSweep(ctx, config, AbortSignal.abort())
    expect(result.summary).toEqual({ imported: 0, skippedExisting: 0, skippedEmpty: 0 })
    expect(result.sessions).toEqual([])
  })

  it('runs the periodic re-scan while autoSync is on and stops it when toggled off', async () => {
    vi.useFakeTimers()
    try {
      const ctx = testContext()
      contexts.push(ctx)
      const settings = makeFakeSettings()
      ctx.provide('settings', settings.service)
      mockedLoad.mockResolvedValue(undefined)
      apply(ctx, { codexHome: 'C:\\anywhere', syncIntervalMs: 1000 })
      await vi.advanceTimersByTimeAsync(0)

      const afterBoot = mockedLoad.mock.calls.length
      expect(afterBoot).toBeGreaterThan(0)

      await vi.advanceTimersByTimeAsync(1000)
      expect(mockedLoad.mock.calls.length).toBe(afterBoot + 1)

      settings.setAutoSync(false)
      const afterToggle = mockedLoad.mock.calls.length
      await vi.advanceTimersByTimeAsync(3000)
      expect(mockedLoad.mock.calls.length).toBe(afterToggle)

      settings.setAutoSync(true)
      const afterReEnable = mockedLoad.mock.calls.length
      await vi.advanceTimersByTimeAsync(1000)
      expect(mockedLoad.mock.calls.length).toBe(afterReEnable + 1)

      await ctx.fiber.dispose()
      contexts.splice(contexts.indexOf(ctx), 1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('defaults autoSync to on when the settings section value is unavailable', async () => {
    vi.useFakeTimers()
    try {
      const ctx = testContext()
      contexts.push(ctx)
      ctx.provide('settings', {
        installSection(
          _owner: unknown,
          _ns: string,
          _schema: unknown,
          _entry: unknown,
          hooks: { setSource: () => void; onChange: () => void },
        ): void {
          hooks.setSource()
          hooks.onChange()
        },
        get(): undefined { return undefined },
      })
      mockedLoad.mockResolvedValue(undefined)
      apply(ctx, { codexHome: 'C:\\anywhere', syncIntervalMs: 1000 })
      await vi.advanceTimersByTimeAsync(0)
      const afterBoot = mockedLoad.mock.calls.length
      await vi.advanceTimersByTimeAsync(1000)
      expect(mockedLoad.mock.calls.length).toBe(afterBoot + 1)
      await ctx.fiber.dispose()
      contexts.splice(contexts.indexOf(ctx), 1)
    } finally {
      vi.useRealTimers()
    }
  })
})
