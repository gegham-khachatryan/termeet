import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react"
import type { ChatMessage } from "../types"

interface ChatEntry {
  id: string
  type: "chat" | "system"
  message?: ChatMessage
  text?: string
}

interface ChatPanelProps {
  messages: ChatEntry[]
  onSend: (content: string) => void
  inputRef?: RefObject<HTMLInputElement | null>
}

export type { ChatEntry }

export function ChatPanel({ messages, onSend, inputRef }: ChatPanelProps) {
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && input.trim()) {
      onSend(input.trim())
      setInput("")
    }
  }

  return (
    <div className="chat-area">
      <div className="chat-messages" ref={scrollRef}>
        {messages.map((entry) => {
          if (entry.type === "system") {
            return (
              <div key={entry.id} className="chat-msg system">
                &gt; {entry.text}
              </div>
            )
          }
          const msg = entry.message!
          const time = new Date(msg.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
          return (
            <div key={entry.id} className="chat-msg">
              <span className="sender">{msg.senderName}</span>
              <span className="time">{time}</span>
              <br />
              <span className="body">{msg.content}</span>
            </div>
          )
        })}
      </div>
      <div className="input-row chat-input">
        <span className="prompt">&gt;</span>
        <input
          ref={inputRef}
          type="text"
          placeholder="Type a message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
    </div>
  )
}
