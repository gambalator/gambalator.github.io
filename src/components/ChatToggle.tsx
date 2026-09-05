interface ChatToggleProps {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
  compact?: boolean
}

export function ChatToggle({
  checked,
  label,
  onChange,
  compact = false,
}: ChatToggleProps) {
  return (
    <label className={`chat-toggle${checked ? ' checked' : ''}${compact ? ' compact' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={label}
      />
      <span className="chat-toggle-track" aria-hidden="true">
        <span className="chat-toggle-knob" />
      </span>
      <span className="chat-toggle-text">Chat</span>
    </label>
  )
}
