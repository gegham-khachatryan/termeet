import { useState, useRef } from "react"
import type { ChatMessage } from "../protocol.ts"
import { inputChrome } from "./input-chrome.ts"

interface ChatPanelProps {
  messages: ChatMessage[]
  onSendMessage: (content: string) => void
  focused: boolean
  selfId: string
  onFocus: () => void
}

export function ChatPanel({ messages, onSendMessage, focused, selfId, onFocus }: ChatPanelProps) {
  const [draft, setDraft] = useState("")
  const draftRef = useRef("")

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  }

  const chatContent = messages
    .map((msg) => {
      const time = formatTime(msg.timestamp)
      const mine = msg.senderId === selfId
      const prefix = mine ? "You" : msg.senderName
      return `[${time}] ${prefix}: ${msg.content}`
    })
    .join("\n")

  return (
    <box
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={focused ? "cyan" : "#555555"}
      title=" Chat "
      titleAlignment="center"
      width="100%"
      height="100%"
    >
      <scrollbox flexGrow={1} padding={1}>
        {messages.length === 0 ? (
          <text fg="#666666">No messages yet — say hello below.</text>
        ) : (
          <text fg="#cccccc">{chatContent}</text>
        )}
      </scrollbox>

      <box
        flexDirection="row"
        alignItems="center"
        gap={1}
        border
        borderStyle="rounded"
        borderColor={focused ? "cyan" : "#3d5268"}
        title=" Message "
        titleAlignment="left"
        paddingX={1}
        paddingY={0}
        marginLeft={1}
        marginRight={1}
        marginBottom={1}
        onMouseDown={() => onFocus()}
      >
        <box flexGrow={1}>
          <input
            focused={focused}
            placeholder={focused ? "Write something… (Enter to send)" : "Tab or click to type…"}
            value={draft}
            style={inputChrome}
            onInput={(val: string) => {
              draftRef.current = val
              setDraft(val)
            }}
            onSubmit={
              (() => {
                const text = draftRef.current.trim()
                if (!text) return
                onSendMessage(text)
                draftRef.current = ""
                setDraft("")
              }) as never
            }
          />
        </box>
        <text fg={focused ? "#6a9aaa" : "#444455"}>⏎</text>
      </box>
    </box>
  )
}
