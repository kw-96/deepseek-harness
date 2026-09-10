import type { ChatNode } from '../contract/chat-nodes.ts'
import type {
  ChatLocationNodeIndex, ChatNodeStore, ChatTurnProcessPresentation,
} from '../contract/snapshot.ts'
import { hasAssistantReplyContent } from '../contract/assistant-content.ts'
import { isSubagentDelegationTool, TURN_PROCESS_INDEPENDENT_KINDS } from '../contract/turn-process.ts'

function nodeTurn(node: ChatNode | undefined): number | undefined {
  const location = node?.location
  return location?.kind === 'turn' || location?.kind === 'step' ? location.turn.turn : undefined
}

function samePresentation(
  left: ChatTurnProcessPresentation | undefined,
  right: ChatTurnProcessPresentation | undefined,
): boolean {
  return left === right || (left !== undefined && right !== undefined
    && left.spec === right.spec
    && left.turn === right.turn
    && left.turnClosed === right.turnClosed
    && left.hasExternalProcess === right.hasExternalProcess
    && left.compactAnswer === right.compactAnswer
    && left.streamFoldEnd === right.streamFoldEnd
    && left.foldedToolCalls === right.foldedToolCalls
    && left.foldedSubagents === right.foldedSubagents)
}

/** A call's wire name and settled status, read off its root lifecycle value. */
function toolCallFacts(node: ChatNode | undefined): { name: string; settled: boolean } | undefined {
  if (node?.kind !== 'tool-call') return undefined
  const root = node.data.root
  const settled = 'kind' in root
  return {
    name: settled ? root.call?.name ?? '' : root.name,
    settled,
  }
}

/**
 * Streaming fold presence anchor: the latest contentful message, or the
 * earliest still-running call while no message exists yet. Streaming folds
 * are kind-based (settled Tools, reasoning-only rows, context), so this value
 * only marks that a foldable window exists rather than gating members.
 * @param keys - ordered Chat Node keys of the Turn.
 * @param nodes - current Chat Node store.
 * @returns the anchor (MAX when the Turn owns neither anchor).
 */
function streamingFoldEnd(keys: readonly string[], nodes: ChatNodeStore): number {
  let runningAnchor: number | null = null
  let messageAnchor: number | null = null
  for (const key of keys) {
    const node = nodes.get(key) as ChatNode | undefined
    if (node === undefined) continue
    if (node.kind === 'tool-call') {
      const facts = toolCallFacts(node)
      if (facts !== undefined && !facts.settled && runningAnchor === null) runningAnchor = node.anchorSeq
    } else if (node.kind === 'assistant-step' && hasAssistantReplyContent(node.data.blocks)) {
      messageAnchor = node.anchorSeq
    }
  }
  return messageAnchor ?? runningAnchor ?? Number.MAX_SAFE_INTEGER
}

/** Settled-fold counts for one streaming Turn (kind-based, position-free). */
function streamingFoldCounts(
  keys: readonly string[],
  nodes: ChatNodeStore,
  startSeq: number,
): { toolCalls: number; subagents: number; others: number } {
  let toolCalls = 0
  let subagents = 0
  let others = 0
  for (const key of keys) {
    const node = nodes.get(key) as ChatNode | undefined
    if (node === undefined || node.anchorSeq < startSeq) continue
    if (node.kind === 'tool-call') {
      // Settled calls fold regardless of position — only the running tree
      // stays visible.
      const facts = toolCallFacts(node)
      if (facts === undefined || !facts.settled) continue
      if (isSubagentDelegationTool(facts.name)) subagents += 1
      else toolCalls += 1
      continue
    }
    // Contentful Assistant rows stay visible (the message boundary) and a
    // live retry is an active signal, not foldable noise; every other process
    // member folds wherever it sits: context injection, reasoning-only
    // Assistant rows.
    if (node.kind === 'assistant-step' && hasAssistantReplyContent(node.data.blocks)) continue
    if (node.kind === 'model-retry' || TURN_PROCESS_INDEPENDENT_KINDS.has(node.kind)) continue
    others += 1
  }
  return { toolCalls, subagents, others }
}

function derivePresentation(
  turn: number,
  locations: ChatLocationNodeIndex,
  nodes: ChatNodeStore,
): ChatTurnProcessPresentation | undefined {
  const keys = locations.getTurn(turn)
  const control = keys
    .map(key => nodes.get(key) as ChatNode | undefined)
    .find((node): node is ChatNode<'turn-process'> => node?.kind === 'turn-process')
  if (control === undefined) return undefined

  const spec = control.data
  const location = control.location
  if (location.kind !== 'turn' && location.kind !== 'step') return undefined
  let openingHumanAnchor: number | undefined
  for (const key of keys) {
    const node = nodes.get(key) as ChatNode | undefined
    if ((node?.kind === 'user' || node?.kind === 'steering')
      && node.anchorSeq < spec.controlAnchorSeq) {
      openingHumanAnchor = Math.min(openingHumanAnchor ?? node.anchorSeq, node.anchorSeq)
    }
  }

  let hasExternalProcess = false
  let compactAnswer = true
  for (const key of keys) {
    const node = nodes.get(key) as ChatNode | undefined
    if (node === undefined || node.kind === 'turn-process') continue
    if ((node.kind === 'user' || node.kind === 'steering')
      && (openingHumanAnchor === undefined || node.anchorSeq > openingHumanAnchor)
      && (spec.answerAnchorSeq === null || node.anchorSeq < spec.answerAnchorSeq)) {
      compactAnswer = false
    }
    if (TURN_PROCESS_INDEPENDENT_KINDS.has(node.kind)
      || node.anchorSeq < spec.processStartSeq
      || (spec.answerAnchorSeq !== null && node.anchorSeq >= spec.answerAnchorSeq)) continue
    if (node.kind !== 'assistant-step' || spec.answerStep === null || node.data.step !== spec.answerStep) {
      hasExternalProcess = true
    }
  }
  const turnClosed = location.turn.status === 'closed'
  // Streaming fold applies whenever the Turn lacks a final answer — running,
  // or closed by interruption. Settled calls, reasoning-only rows, and other
  // process rows collapse into the disclosure; the closed answered Turn keeps
  // its answer-boundary fold exclusively.
  const streaming = spec.answerAnchorSeq === null
  const streamCounts = streaming
    ? streamingFoldCounts(keys, nodes, spec.processStartSeq)
    : { toolCalls: 0, subagents: 0, others: 0 }
  // No member to fold: keep the live Turn fully expanded (an empty
  // disclosure line is noise, not a control).
  const streamFoldEnd = streamCounts.toolCalls + streamCounts.subagents + streamCounts.others === 0
    ? null
    : streamingFoldEnd(keys, nodes)
  return {
    turn,
    spec,
    turnClosed,
    hasExternalProcess,
    compactAnswer,
    streamFoldEnd,
    foldedToolCalls: streamCounts.toolCalls,
    foldedSubagents: streamCounts.subagents,
  }
}

/** Mutable projection of cross-Node process layout facts by Turn. */
export class ChatTurnProcessProjector {
  private presentations = new Map<number, ChatTurnProcessPresentation>()

  /**
   * Read the retained process presentation for a Node's Turn.
   * @param node - Current Chat Node.
   * @returns The Turn's process presentation, when present.
   */
  get(node: ChatNode | undefined): ChatTurnProcessPresentation | undefined {
    const turn = nodeTurn(node)
    return turn === undefined ? undefined : this.presentations.get(turn)
  }

  /**
   * Replace every projected Turn.
   * @param order - visible Chat Node order.
   * @param locations - current Chat Location index.
   * @param nodes - current Chat Node store.
   * @returns Turns whose process presentation changed.
   */
  replace(
    order: readonly string[],
    locations: ChatLocationNodeIndex,
    nodes: ChatNodeStore,
  ): ReadonlySet<number> {
    const turns = new Set<number>()
    for (const key of order) {
      const turn = nodeTurn(nodes.get(key) as ChatNode | undefined)
      if (turn !== undefined) turns.add(turn)
    }
    const changed = new Set<number>()
    for (const turn of new Set([...this.presentations.keys(), ...turns])) {
      if (this.set(turn, turns.has(turn) ? derivePresentation(turn, locations, nodes) : undefined)) {
        changed.add(turn)
      }
    }
    return changed
  }

  /**
   * Recompute selected Turns after incremental Node changes.
   * @param turns - affected Turn numbers.
   * @param locations - current Chat Location index.
   * @param nodes - current Chat Node store.
   * @returns Turns whose process presentation changed.
   */
  update(
    turns: ReadonlySet<number>,
    locations: ChatLocationNodeIndex,
    nodes: ChatNodeStore,
  ): ReadonlySet<number> {
    const changed = new Set<number>()
    for (const turn of turns) {
      if (this.set(turn, derivePresentation(turn, locations, nodes))) changed.add(turn)
    }
    return changed
  }

  private set(turn: number, next: ChatTurnProcessPresentation | undefined): boolean {
    const current = this.presentations.get(turn)
    if (samePresentation(current, next)) return false
    if (next === undefined) this.presentations.delete(turn)
    else this.presentations.set(turn, next)
    return true
  }
}
