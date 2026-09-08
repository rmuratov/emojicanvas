import { useSyncExternalStore } from 'react'

import type { Editor, EditorState } from '../editor'

const NOTHING = () => () => {}

/**
 * The state of an editor that does not exist yet. A module constant rather
 * than a fresh object, because getSnapshot is called on every render and
 * compared by identity.
 */
const EMPTY: EditorState = {
  brush: '❤️',
  canRedo: false,
  canUndo: false,
  isEmpty: true,
  toolId: 'brush',
  zoom: 1,
}

/**
 * Reads editor state through useSyncExternalStore, so React keeps no copy of
 * its own to fall out of sync with the engine.
 */
export function useEditorState(editor: Editor | null): EditorState {
  return useSyncExternalStore(
    editor ? listener => editor.subscribe(listener) : NOTHING,
    editor ? () => editor.getSnapshot() : () => EMPTY,
  )
}
