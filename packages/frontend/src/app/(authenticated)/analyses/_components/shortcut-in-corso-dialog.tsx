'use client'

import { ShortcutAnalysisDialog, type ShortcutAnalysisDialogProps } from './shortcut-analysis-dialog'

type ShortcutInCorsoDialogProps = Omit<ShortcutAnalysisDialogProps, 'variant'>

export function ShortcutInCorsoDialog(props: ShortcutInCorsoDialogProps) {
  return <ShortcutAnalysisDialog variant="in-corso" {...props} />
}
