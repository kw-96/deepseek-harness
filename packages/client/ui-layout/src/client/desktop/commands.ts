/**
 * Cross-plugin desktop title-bar commands delivered as window CustomEvents.
 * Feature packages listen without taking a ui-layout runtime dependency.
 */

/** Window event name for desktop chrome commands. */
export const DESKTOP_COMMAND_EVENT = 'dsh-desktop:command'

/** Commands the title bar may dispatch to other plugins. */
export type DesktopCommand =
  | 'new-session'
  | 'open-settings'
  | 'add-workspace'

/** Detail payload for {@link DESKTOP_COMMAND_EVENT}. */
export type DesktopCommandDetail = { readonly command: DesktopCommand }

/**
 * Dispatch a desktop chrome command to listening plugins.
 * @param command - command discriminator.
 */
export function dispatchDesktopCommand(command: DesktopCommand): void {
  window.dispatchEvent(new CustomEvent<DesktopCommandDetail>(DESKTOP_COMMAND_EVENT, {
    detail: { command },
  }))
}

/**
 * Subscribe to desktop chrome commands.
 * @param handler - receives the command discriminator.
 * @returns disposer.
 */
export function onDesktopCommand(handler: (command: DesktopCommand) => void): () => void {
  const listener = (event: Event): void => {
    // Unrelated same-name events may carry no detail payload at runtime.
    const detail = (event as CustomEvent<DesktopCommandDetail | undefined>).detail
    if (detail === undefined) return
    handler(detail.command)
  }
  window.addEventListener(DESKTOP_COMMAND_EVENT, listener)
  return () => { window.removeEventListener(DESKTOP_COMMAND_EVENT, listener) }
}
