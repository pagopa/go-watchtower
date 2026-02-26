'use client'

import { ShortcutAnalysisDialog, type ShortcutAnalysisDialogProps } from './shortcut-analysis-dialog'

type ShortcutIgnoreListDialogProps = Omit<ShortcutAnalysisDialogProps, 'variant'>

export function ShortcutIgnoreListDialog(props: ShortcutIgnoreListDialogProps) {
  return <ShortcutAnalysisDialog variant="ignore-list" {...props} />
}
