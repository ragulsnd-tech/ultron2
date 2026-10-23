
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

type Message = {
  role: "user" | "assistant";
  text: string;
};

type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
};

type VoiceRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

const WELCOME: Message = {
  role: "assistant",
  text: "Vanakkam! Naan JARVIS. Enna help venum?",
};

const STORAGE_KEY = "jarvis-chat-sessions";
const ACTIVE_KEY = "jarvis-active-chat";

function makeChat(): ChatSession {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: "New chat",
    messages: [WELCOME],
  };
}

export default function ChatPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [voiceMode, setVoiceMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("JARVIS ready");
  const [ready, setReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<VoiceRecognition | null>(null);
  const voiceModeRef = useRef(false);
  const voiceOnRef = useRef(true);
  const loadingRef = useRef(false);
  const mountedRef = useRef(false);
  const startListeningRef = useRef<() => void>(() => {});

  const activeChat = sessions.find((chat) => chat.id === activeId);
  const messages = activeChat?.messages ?? [WELCOME];

  useEffect(() => {
    mountedRef.current = true;
    let initialSessions: ChatSession[] = [];
    let initialActiveId = "";

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (
          Array.isArray(parsed) &&
          parsed.every(
            (chat) =>
              chat &&
              typeof chat.id === "string" &&
              typeof chat.title === "string" &&
              Array.isArray(chat.messages) &&
              chat.messages.every(
                (message: Message) =>
                  message &&
                  (message.role === "user" ||
                    message.role === "assistant") &&
                  typeof message.text === "string"
              )
          )
        ) {
          initialSessions = parsed as ChatSession[];
        }
      }
      initialActiveId = localStorage.getItem(ACTIVE_KEY) || "";
    } catch {}

    if (!initialSessions.length) {
      const first = makeChat();
      initialSessions = [first];
      initialActiveId = first.id;
    }

    if (!initialSessions.some((chat) => chat.id === initialActiveId)) {
      initialActiveId = initialSessions[0].id;
    }

    setSessions(initialSessions);
    setActiveId(initialActiveId);
    setReady(true);

    return () => {
      mountedRef.current = false;
      voiceModeRef.current = false;
      try {
        recognitionRef.current?.stop();
      } catch {}
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
      localStorage.setItem(ACTIVE_KEY, activeId);
    } catch {}
  }, [sessions, activeId, ready]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, loading]);

  const updateMessages = useCallback(
    (updater: (old: Message[]) => Message[]) => {
      setSessions((oldSessions) =>
        oldSessions.map((chat) => {
          if (chat.id !== activeId) return chat;
          const nextMessages = updater(chat.messages);
          const firstUser = nextMessages.find(
            (message) => message.role === "user"
          );
          return {
            ...chat,
            messages: nextMessages,
            title:
              chat.title === "New chat" && firstUser
                ? firstUser.text.slice(0, 36) +
                  (firstUser.text.length > 36 ? "…" : "")
                : chat.title,
          };
        })
      );
    },
    [activeId]
  );
  useEffect(() => {
  voiceOnRef.current = voiceOn;

  if (!voiceOn && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}, [voiceOn]);
  const speak = useCallback((text: string) => {
    if (!voiceOnRef.current || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const malePattern =
      /male|david|mark|guy|daniel|james|aaron|george|rishi|fred|alex/i;

    const preferred =
      voices.find(
        (v) => malePattern.test(v.name) &&
          /en-IN|en-GB|en-US/i.test(v.lang)
      ) ||
      voices.find(
        (v) => v.lang.toLowerCase() === "en-in" ||
          v.lang.toLowerCase() === "en-gb" ||
          v.lang.toLowerCase() === "en-us"
      ) ||
      voices.find((v) => v.lang.toLowerCase().startsWith("ta"));

    if (preferred) {
      utterance.voice = preferred;
      utterance.lang = preferred.lang;
    } else {
      utterance.lang = "en-IN";
    }

    utterance.rate = 0.88;
    utterance.pitch = 0.72;
    window.speechSynthesis.speak(utterance);
  }, []);

  async function openCommand(question: string): Promise<boolean> {
    const text = question.trim();

    const searchMatch = text.match(
      /^(?:google(?:\s+la)?|search(?:\s+google)?|search\s+for)\s+(.+)$/i
    );

    if (searchMatch) {
      const query = searchMatch[1].trim();
      window.open(
        "https://www.google.com/search?q=" + encodeURIComponent(query),
        "_blank",
        "noopener,noreferrer"
      );
      updateMessages((old) => [
        ...old,
        {
          role: "assistant",
          text: `Google-la "${query}" search open panna try panninen.`,
        },
      ]);
      setStatus("Google search opened");
      return true;
    }

    const appMatch = text.match(
  /^(?:jarvis[, ]*)?(?:open|launch|start)\s+(.+)$/i
      );

  try {
    const response = await fetch(
      "http://127.0.0.1:3210/open-app",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ app: query }),
      }
    );

    const data = await response.json();

    if (response.ok && data.success) {
      updateMessages((old) => [
        ...old,
        {
          role: "assistant",
          text: `"${query}" app open panniten.`,
        },
      ]);
      return true;
    }

    window.open(
      "https://www.google.com/search?q=" +
        encodeURIComponent(query + " app"),
      "_blank"
    );

    updateMessages((old) => [
      ...old,
      {
        role: "assistant",
        text: `"${query}" app open aagala. Google-la search pannuren.`,
      },
    ]);

    return true;
  } catch {
    window.open(
      "https://www.google.com/search?q=" +
        encodeURIComponent(query + " app"),
      "_blank"
    );

    updateMessages((old) => [
      ...old,
      {
        role: "assistant",
        text: `"${query}" app open aagala. Google-la search pannuren.`,
      },
    ]);

    return true;
  }
}

    if (appMatch) {
      const app = appMatch[1].toLowerCase();
      try {
        const response = await fetch("http://127.0.0.1:3210/open-app", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ app }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "App open failed");

        updateMessages((old) => [
          ...old,
          {
            role: "assistant",
            text: data.message || `${app} open command sent.`,
          },
        ]);
      } catch {
        updateMessages((old) => [
          ...old,
          {
            role: "assistant",
            text:
              `${app} app-ai direct-ah open panna local agent setup thevai. ` +
              "Browser mattum use pannina installed apps-ai launch panna mudiyadhu.",
          },
        ]);
      }
      setStatus("App command checked");
      return true;
    }

    return false;
    }
  
  const sendMessage = async (text?: string) => {
    const prompt = (text ?? input).trim();
    if (!prompt || loading) return;

    setInput("");

    if (await openCommand(prompt)) return;

    setLoading(true);

    const userMessage: Message = {
      role: "user",
      text: prompt,
    };

    updateMessages((old) => [...old, userMessage]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prompt,
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.text,
          })),
          chatId: activeId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      const reply =
        data.reply || data.response || data.message || data.text;

      if (typeof reply !== "string" || !reply.trim()) {
        throw new Error("JARVIS reply empty");
      }

      updateMessages((old) => [
        ...old,
        { role: "assistant", text: reply },
      ]);

      if (voiceOnRef.current) speak(reply);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Request failed";

      updateMessages((old) => [
        ...old,
        {
          role: "assistant",
          text: `JARVIS error: ${errorMessage}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }; 
  const startListening = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Voice input is not supported in this browser. Try Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);

    recognition.onerror = () => {
      setListening(false);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      void sendMessage(transcript);
    };

    recognition.start();
  };

  const toggleVoiceOutput = () => {
  setVoiceOn((previous) => !previous);
    };
  const next = !voiceMode;
  setVoiceMode(next);

  if (next) {
    setStatus("JARVIS voice mode");
  } else {
    try {
      recognitionRef.current?.stop();
    } catch {}
    setListening(false);
    setStatus("JARVIS ready");
  }
};

  const newChat = () => {
  const chat = makeChat();

  setSessions((previous) => [chat, ...previous]);
  setActiveId(chat.id);
  setInput("");
  setSidebarOpen(false);
};

const selectChat = (chat: { id: string; title: string }) => {
  setActiveId(chat.id);
  setInput("");
  setSidebarOpen(false);
};

const deleteChat = (id: string) => {
  setSessions((previous) => {
    const remaining = previous.filter((chat) => chat.id !== id);

    if (activeId === id) {
      if (remaining.length > 0) {
        setActiveId(remaining[0].id);
      } else {
        const chat = makeChat();
        setActiveId(chat.id);
        return [chat];
      }
    }

    return remaining;
  });
};

  return (
    <main style={s.app}>
      {sidebarOpen && (
        <div
          style={s.backdrop}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        style={{
          ...s.sidebar,
          left: sidebarOpen ? 0 : -280,
        }}
      >
        <div style={s.sidebarHeader}>
          <div style={s.brand}>
            <span style={s.brandIcon}>J</span>
            <span>JARVIS</span>
          </div>
          <button style={s.iconButton} onClick={newChat}>
            ＋
          </button>
        </div>

        <button style={s.newChatButton} onClick={newChat}>
          ＋ New chat
        </button>

        <div style={s.historyTitle}>RECENT CHATS</div>

        <div style={s.historyList}>
          {sessions.map((chat) => (
            <div key={chat.id} style={s.historyRow}>
              <button
                style={{
                  ...s.historyButton,
                  ...(activeId === chat.id ? s.activeHistory : {}),
                }}
                onClick={() => selectChat(chat)}
              >
                <span style={s.historyDot}>●</span>
                <span style={s.historyText}>{chat.title}</span>
              </button>

              <button
                style={s.deleteButton}
                onClick={() => deleteChat(chat.id)}
                aria-label="Delete chat"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div style={s.sidebarFooter}>JARVIS AI ASSISTANT</div>
      </aside>

      <section style={s.main}>
        <header style={s.header}>
          <button
            style={s.iconButton}
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            ☰
          </button>

          <div style={s.headerInfo}>
            <div style={s.headerTitle}>JARVIS</div>
            <div style={s.headerSubtitle}>
              {voiceMode ? "Voice mode" : "AI assistant"}
            </div>
          </div>

          <button
            style={{
              ...s.voiceButton,
              ...(voiceMode ? s.voiceButtonActive : {}),
            }}
            onClick={toggleVoiceMode}
          >
            {voiceMode ? "Text mode" : "🎙 Voice"}
          </button>
        </header>

        {voiceMode && (
          <div style={s.voicePanel}>
            <div style={s.orbOuter}>
              <div style={s.orbInner}>J</div>
            </div>

            <div style={s.voiceStatus}>
              {listening
                ? "LISTENING..."
                : loading
                  ? "THINKING..."
                  : "JARVIS VOICE MODE"}
            </div>

            <button
              style={s.listenButton}
              onClick={startListening}
              disabled={loading || listening}
            >
              {listening ? "Listening..." : "🎙 Speak to JARVIS"}
            </button>

            <button
              style={s.outputButton}
              onClick={toggleVoiceOutput}
            >
              Voice reply: {voiceOn ? "ON" : "OFF"}
            </button>
          </div>
        )}

        <div style={s.messages}>
          {messages.length === 0 && (
            <div style={s.welcome}>
              <div style={s.welcomeIcon}>J</div>
              <h1 style={s.welcomeTitle}>How can I help you?</h1>
              <p style={s.welcomeText}>
                Ask anything. JARVIS is ready.
              </p>

              <div style={s.suggestions}>
                {[
                  "Explain artificial intelligence",
                  "Write a Python program",
                  "Give me today's study plan",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    style={s.suggestion}
                    onClick={() => void sendMessage(suggestion)}
                  >
                    {suggestion} →
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={`${index}-${message.role}`}
              style={{
                ...s.messageRow,
                ...(message.role === "user"
                  ? s.userMessageRow
                  : {}),
              }}
            >
              {message.role === "assistant" && (
                <div style={s.avatar}>J</div>
              )}

              <div
                style={{
                  ...s.messageBubble,
                  ...(message.role === "user"
                    ? s.userBubble
                    : s.assistantBubble),
                }}
              >
                <div style={s.messageRole}>
                  {message.role === "user" ? "You" : "JARVIS"}
                </div>
                <div style={s.messagecontent}>{message.text}</div>
              </div>
            </div>
          ))}

          {loading && (
            <div style={s.loadingText}>JARVIS is thinking...</div>
          )}

          <div ref={bottomRef} />
        </div>

        <footer style={s.composerArea}>
          <div style={s.composer}>
            <textarea
              style={s.textarea}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey
                ) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="Message JARVIS..."
              rows={1}
            />

            <button
              style={s.micButton}
              onClick={startListening}
              title="Voice input"
              disabled={loading || listening}
            >
              🎙
            </button>

            <button
              style={s.sendButton}
              onClick={() => void sendMessage()}
              disabled={loading || !input.trim()}
            >
              ➤
            </button>
          </div>

          <div style={s.disclaimer}>
            JARVIS can make mistakes. Verify important information.
          </div>
        </footer>
      </section>

      <style jsx>{`
        @keyframes orbPulse {
          0%, 100% {
            transform: scale(0.96);
            box-shadow: 0 0 25px #168bff66, 0 0 60px #7c3aed44;
          }
          50% {
            transform: scale(1.04);
            box-shadow: 0 0 40px #168bffaa, 0 0 90px #7c3aed88;
          }
        }
        textarea {
          font: inherit;
        }
        button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
      `}</style>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  app: {
    display: "flex",
    height: "100dvh",
    width: "100%",
    overflow: "hidden",
    background: "#101114",
    color: "#f4f4f5",
    fontFamily: "Arial, sans-serif",
    position: "relative",
  },
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "#0009",
    zIndex: 900,
  },
  sidebar: {
    position: "fixed",
    top: 0,
    bottom: 0,
    width: 260,
    background: "#17181c",
    borderRight: "1px solid #292a30",
    display: "flex",
    flexDirection: "column",
    padding: 12,
    boxSizing: "border-box",
    zIndex: 1000,
    transition: "left 0.2s ease",
  },
  sidebarHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 4px 18px",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontWeight: 700,
    letterSpacing: 2,
  },
  brandIcon: {
    display: "grid",
    placeItems: "center",
    width: 32,
    height: 32,
    borderRadius: 10,
    background: "linear-gradient(135deg,#168bff,#8b5cf6)",
  },
  iconButton: {
    background: "transparent",
    color: "#eee",
    border: "1px solid #35363d",
    borderRadius: 9,
    padding: "8px 11px",
    cursor: "pointer",
  },
  newChatButton: {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    border: "1px solid #34353c",
    color: "#f4f4f5",
    background: "#222329",
    textAlign: "left",
    cursor: "pointer",
  },
  historyTitle: {
    color: "#858691",
    fontSize: 11,
    letterSpacing: 1.5,
    margin: "24px 8px 10px",
  },
  historyList: {
    flex: 1,
    overflowY: "auto",
  },
  historyRow: {
    display: "flex",
    alignItems: "center",
    gap: 3,
    marginBottom: 5,
  },
  historyButton: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
    padding: 10,
    border: "none",
    borderRadius: 8,
    color: "#d4d4d8",
    background: "transparent",
    textAlign: "left",
    cursor: "pointer",
  },
  activeHistory: {
    background: "#2a2b33",
  },
  historyDot: {
    color: "#818cf8",
    fontSize: 9,
  },
  historyText: {
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    fontSize: 13,
  },
  deleteButton: {
    color: "#a1a1aa",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: 7,
    fontSize: 18,
  },
  sidebarFooter: {
    borderTop: "1px solid #2b2c32",
    padding: "15px 5px 5px",
    color: "#71717a",
    fontSize: 10,
    letterSpacing: 1.5,
  },
  main: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    minWidth: 0,
    height: "100%",
  },
  header: {
    height: 62,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "0 16px",
    borderBottom: "1px solid #292a30",
    background: "#101114",
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: 1.5,
  },
  headerSubtitle: {
    color: "#92939e",
    fontSize: 12,
    marginTop: 3,
  },
  voiceButton: {
    color: "#e4e4e7",
    background: "#222329",
    border: "1px solid #373841",
    borderRadius: 10,
    padding: "9px 12px",
    cursor: "pointer",
  },
  voiceButtonActive: {
    background: "#312e81",
    borderColor: "#6366f1",
  },
  voicePanel: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    flexDirection: "column",
    gap: 12,
    padding: "22px 12px 10px",
    borderBottom: "1px solid #292a30",
  },
  orbOuter: {
    width: 94,
    height: 94,
    display: "grid",
    placeItems: "center",
    borderRadius: "50%",
    background: "radial-gradient(circle at 30% 25%,#9bdcff,#168bff 38%,#4c1d95 75%,#101114)",
    animation: "orbPulse 2.4s ease-in-out infinite",
  },
  orbInner: {
    width: 58,
    height: 58,
    display: "grid",
    placeItems: "center",
    borderRadius: "50%",
    color: "white",
    fontSize: 27,
    fontWeight: 700,
    background: "radial-gradient(circle at 35% 25%,#60a5fa,#1e1b4b 75%)",
    border: "1px solid #a5d8ff88",
  },
  voiceStatus: {
    fontSize: 11,
    letterSpacing: 2,
    color: "#a5b4fc",
  },
  listenButton: {
    border: "1px solid #3b82f6",
    background: "#1d4ed8",
    color: "white",
    borderRadius: 10,
    padding: "10px 16px",
    cursor: "pointer",
  },
  outputButton: {
    color: "#c4b5fd",
    background: "transparent",
    border: "none",
    padding: 6,
    cursor: "pointer",
  },
  messages: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "24px 16px",
  },
  welcome: {
    maxWidth: 620,
    margin: "8vh auto 0",
    textAlign: "center",
  },
  welcomeIcon: {
    width: 54,
    height: 54,
    display: "grid",
    placeItems: "center",
    margin: "0 auto 18px",
    borderRadius: 18,
    fontSize: 25,
    fontWeight: 700,
    background: "linear-gradient(135deg,#168bff,#8b5cf6)",
  },
  welcomeTitle: {
    fontSize: 25,
    margin: "0 0 10px",
  },
  welcomeText: {
    color: "#a1a1aa",
    fontSize: 14,
  },
  suggestions: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
    gap: 10,
    marginTop: 28,
  },
  suggestion: {
    background: "#191a1f",
    color: "#d4d4d8",
    border: "1px solid #303139",
    borderRadius: 12,
    padding: 14,
    textAlign: "left",
    cursor: "pointer",
  },
  messageRow: {
    display: "flex",
    gap: 10,
    maxWidth: 820,
    margin: "0 auto 22px",
    alignItems: "flex-start",
  },
  userMessageRow: {
    justifyContent: "flex-end",
  },
  avatar: {
    width: 30,
    height: 30,
    flexShrink: 0,
    display: "grid",
    placeItems: "center",
    borderRadius: 9,
    background: "linear-gradient(135deg,#168bff,#8b5cf6)",
    fontWeight: 700,
    fontSize: 13,
  },
  messageBubble: {
    maxWidth: "85%",
    padding: "12px 14px",
    borderRadius: 14,
    lineHeight: 1.6,
    overflowWrap: "anywhere",
  },
  assistantBubble: {
    background: "#191a1f",
    border: "1px solid #2b2c33",
  },
  userBubble: {
    background: "#26344b",
    border: "1px solid #354a68",
  },
  messageRole: {
    color: "#a5b4fc",
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 6,
  },
  messageContent: {
    whiteSpace: "pre-wrap",
    fontSize: 14,
  },
  loadingText: {
    maxWidth: 820,
    margin: "0 auto 15px",
    color: "#a1a1aa",
    fontSize: 13,
  },
  composerArea: {
    flexShrink: 0,
    padding: "12px 16px 10px",
    background: "#101114",
  },
  composer: {
    display: "flex",
    alignItems: "flex-end",
    gap: 8,
    maxWidth: 820,
    margin: "0 auto",
    padding: 8,
    background: "#1b1c21",
    border: "1px solid #393a43",
    borderRadius: 16,
  },
  textarea: {
    flex: 1,
    minWidth: 0,
    maxHeight: 140,
    resize: "vertical",
    border: "none",
    outline: "none",
    color: "#f4f4f5",
    background: "transparent",
    padding: "9px 6px",
    fontSize: 14,
  },
  micButton: {
    border: "none",
    background: "#2b2c33",
    color: "#e4e4e7",
    borderRadius: 10,
    padding: "10px 12px",
    cursor: "pointer",
  },
  sendButton: {
    border: "none",
    background: "#2563eb",
    color: "white",
    borderRadius: 10,
    padding: "10px 13px",
    cursor: "pointer",
  },
  disclaimer: {
    color: "#71717a",
    fontSize: 10,
    textAlign: "center",
    marginTop: 9,
  },
};
      
