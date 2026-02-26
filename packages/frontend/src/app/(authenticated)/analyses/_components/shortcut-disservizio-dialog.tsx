'use client'

import { ShortcutAnalysisDialog, type ShortcutAnalysisDialogProps } from './shortcut-analysis-dialog'

type ShortcutDisservizioDialogProps = Omit<ShortcutAnalysisDialogProps, 'variant'>

export function ShortcutDisservizioDialog(props: ShortcutDisservizioDialogProps) {
  return <ShortcutAnalysisDialog variant="disservizio" {...props} />
}
