import { describe, expect, it } from 'vitest'
import { projectAddDir, projectDirs, projectSetDirs } from '../src/host/projects.js'
import type { FileSystem } from '@deepseek-ai/dsh-fs'

/** In-memory FileSystem fake covering the resolve/stat/readText/writeText surface projects.ts uses. */
class MemoryFs implements Partial<FileSystem> {
  private readonly files = new Map<string, string>()

  async resolve(path: string): Promise<{ path: string }> {
    return { path }
  }

  async stat(): Promise<{ size: number } | undefined> {
    return { size: 0 }
  }

  async readText(target: { path: string }): Promise<string> {
    return this.files.get(target.path) ?? ''
  }

  async writeText(target: { path: string }, content: string): Promise<void> {
    this.files.set(target.path, content)
  }
}

describe('codex-shell project directories', () => {
  it('adds, dedupes, and lists directories per workspace', async () => {
    const fs = new MemoryFs() as unknown as FileSystem
    await expect(projectAddDir(fs, 'ws-1', 'D:\\a')).resolves.toEqual({ dirs: ['D:\\a'], rejected: null })
    await expect(projectAddDir(fs, 'ws-1', 'D:\\b')).resolves.toEqual({ dirs: ['D:\\a', 'D:\\b'], rejected: null })
    await expect(projectAddDir(fs, 'ws-1', 'D:\\a')).resolves.toMatchObject({ rejected: expect.stringContaining('already') })
    await expect(projectDirs(fs, 'ws-1')).resolves.toEqual({ dirs: ['D:\\a', 'D:\\b'] })
    await expect(projectDirs(fs, 'ws-2')).resolves.toEqual({ dirs: [] })
  })

  it('replaces the whole list through setDirs', async () => {
    const fs = new MemoryFs() as unknown as FileSystem
    await projectAddDir(fs, 'ws-1', 'D:\\a')
    await expect(projectSetDirs(fs, 'ws-1', ['E:\\x', 'E:\\x', ''])).resolves.toEqual({ dirs: ['E:\\x'] })
  })

  it('rejects a blank path', async () => {
    const fs = new MemoryFs() as unknown as FileSystem
    await expect(projectAddDir(fs, 'ws-1', '   ')).resolves.toMatchObject({ rejected: expect.stringContaining('blank') })
  })
})
