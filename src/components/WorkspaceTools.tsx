import { useEffect, useRef, useState } from 'react'
import type { Settings } from '../types'
import { SettingsPanel } from './SettingsPanel'

interface WorkspaceToolsProps {
  settings: Settings
  onUpdateSettings: (settings: Settings) => void
  onDirtyChange: (dirty: boolean) => void
}

type WorkspaceDialog = 'settings' | null

export function WorkspaceTools({
  settings,
  onUpdateSettings,
  onDirtyChange,
}: WorkspaceToolsProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [dialog, setDialog] = useState<WorkspaceDialog>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (dialog) closeRef.current?.focus()
  }, [dialog])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (dialog) {
        setDialog(null)
        requestAnimationFrame(() => triggerRef.current?.focus())
      } else {
        setMenuOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [dialog])

  const openDialog = (nextDialog: Exclude<WorkspaceDialog, null>) => {
    setMenuOpen(false)
    setDialog(nextDialog)
  }

  const closeDialog = () => {
    setDialog(null)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const title = 'Параметры расчёта'

  return (
    <div className="workspace-tools" ref={containerRef}>
      <button
        ref={triggerRef}
        className={`workspace-menu-button${menuOpen ? ' open' : ''}`}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls="workspace-tools-menu"
        onClick={() => setMenuOpen((value) => !value)}
      >
        Меню
        <span className={`chevron${menuOpen ? ' open' : ''}`} aria-hidden="true" />
      </button>

      {menuOpen && (
        <div className="workspace-menu-popover" id="workspace-tools-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => openDialog('settings')}>
            <span>Параметры расчёта</span>
            <small>Раунд и курсы валют</small>
          </button>
        </div>
      )}

      {dialog && (
        <div
          className="dialog-backdrop workspace-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialog()
          }}
        >
          <section
            className="workspace-dialog workspace-dialog-settings"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-dialog-title"
          >
            <div className="workspace-dialog-heading">
              <h2 id="workspace-dialog-title">{title}</h2>
              <div className="workspace-dialog-heading-actions">
                <button
                  ref={closeRef}
                  className="history-dialog-close"
                  type="button"
                  aria-label={`Закрыть: ${title}`}
                  onClick={closeDialog}
                >
                  ×
                </button>
              </div>
            </div>
            <div className="workspace-dialog-content">
              <SettingsPanel
                settings={settings}
                onUpdate={onUpdateSettings}
                onDirtyChange={onDirtyChange}
                displayMode="dialog"
              />
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
