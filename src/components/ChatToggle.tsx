interface ChatToggleProps {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
  compact?: boolean
  disabled?: boolean
  text?: string
}

export function ChatToggle({
  checked,
  label,
  onChange,
  compact = false,
  disabled = false,
  text = 'Chat',
}: ChatToggleProps) {
  return (
    <label className={`chat-toggle${checked ? ' checked' : ''}${compact ? ' compact' : ''}${disabled ? ' disabled' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={label}
      />
      <span className="chat-toggle-track" aria-hidden="true">
        <span className="chat-toggle-knob" />
      </span>
      <span className="chat-toggle-text">{text}</span>
    </label>
  )
}
