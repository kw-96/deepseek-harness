/** Per-Session Chat view store. */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { ChatStoreState, TurnProcessViewEntry } from './contract/store.ts'

type ChatActions = {
  setTurnProcessOpen: (
    draft: ChatStoreState,
    turn: number,
    answerStep: number | null,
    open: boolean,
  ) => void
}

/**
 * Resolve the manually expanded answer for one Turn generation.
 * @param state - Chat store snapshot.
 * @param turn - owning Turn.
 * @param answerStep - the generation's answer step (null while streaming).
 * @returns the Turn's stored entry, when it matches the same generation.
 */
export function storedTurnProcessEntry(
  state: Readonly<ChatStoreState>,
  turn: number,
  answerStep: number | null,
): Readonly<TurnProcessViewEntry> | undefined {
  return state.turnProcesses.find(entry => entry.turn === turn && entry.answerStep === answerStep)
}

/**
 * Create the Chat view store handle.
 * @returns a handle instantiated once per rendered Session scope.
 */
export function createChatStore(): EngineStoreHandle<ChatStoreState, ChatActions> {
  return defineStore({
    init: (): ChatStoreState => ({ turnProcesses: [] }),
    actions: {
      setTurnProcessOpen: (draft, turn, answerStep, open) => {
        const index = draft.turnProcesses.findIndex(entry => entry.turn === turn)
        if (!open) {
          if (index >= 0) draft.turnProcesses.splice(index, 1)
          return
        }
        const next = { turn, answerStep } satisfies TurnProcessViewEntry
        if (index < 0) draft.turnProcesses.push(next)
        else draft.turnProcesses[index] = next
      },
    },
  })
}
