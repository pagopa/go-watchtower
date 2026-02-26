'use client'

import { ShortcutAnalysisDialog, type ShortcutAnalysisDialogProps } from './shortcut-analysis-dialog'

type ShortcutNonGestitoDialogProps = Omit<ShortcutAnalysisDialogProps, 'variant'>

export function ShortcutNonGestitoDialog(props: ShortcutNonGestitoDialogProps) {
  return <ShortcutAnalysisDialog variant="non-gestito" {...props} />
}
