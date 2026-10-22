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
        oldSessions.map((chat) =>
          chat.id === activeId
            ? (() => {
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
              })()
            : chat
        )
      );
    },
    [activeId]
  );

  const speak = useCallback((text: string) => {
    if (!voiceOnRef.current || !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();

    // Prefer voices commonly labelled as male.
    // Voice names and availability depend on the device/browser.
    const maleVoicePatterns =
      /male|david|mark|guy|daniel|james|aaron|george|rishi|fred|alex/i;

    const preferredVoice =
      voices.find(
        (voice) =>
          maleVoicePatterns.test(voice.name) &&
          /en-IN|en-GB|en-US/i.test(voice.lang)
      ) ||
      voices.find(
        (voice) =>
          maleVoicePatterns.test(voice.name) &&
          voice.lang.toLowerCase().startsWith("ta")
      ) ||
      voices.find(
        (voice) =>
          voice.lang.toLowerCase() === "en-in" ||
          voice.lang.toLowerCase() === "en-gb" ||
          voice.lang.toLowerCase() === "en-us"
      ) ||
      voices.find((voice) =>
        voice.lang.toLowerCase().startsWith("ta")
      );

    if (preferredVoice) {
      utterance.voice = preferredVoice;
      utterance.lang = preferredVoice.lang;
    } else {
      utterance.lang = "en-IN";
    }

    utterance.rate = 0.92;
    utterance.pitch = 0.82;

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

    const websiteMatch = text.match(
      /^(?:open|visit|go to)\s+(google|youtube|gmail|wikipedia|facebook|instagram|whatsapp web)$/i
    );

    if (websiteMatch) {
      const sites: Record<string, string> = {
        google: "https://www.google.com",
        youtube: "https://www.youtube.com",
        gmail: "https://mail.google.com",
        wikipedia: "https://www.wikipedia.org",
        facebook: "https://www.facebook.com",
        instagram: "https://www.instagram.com",
        "whatsapp web": "https://web.whatsapp.com",
      };

      const site = websiteMatch[1].toLowerCase();

      window.open(sites[site], "_blank", "noopener,noreferrer");

      updateMessages((old) => [
        ...old,
        {
          role: "assistant",
          text: `${site} website open panna try panninen.`,
        },
      ]);

      setStatus("Website command completed");
      return true;
    }

    const appMatch = text.match(
      /^(?:jarvis[, ]*)?(?:open|launch|start)\s+(calculator|notepad|paint|chrome|edge|explorer|file explorer|settings|whatsapp|youtube|instagram|telegram)$/i
    );

    if (appMatch) {
      const app = appMatch[1].toLowerCase();

      try {
        const response = await fetch("http://127.0.0.1:3210/open-app", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ app }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "App open failed");
        }

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

  async function sendMessage(text = input) {
    const question = text.trim();

    if (!question || loadingRef.current || !activeId) return;

    updateMessages((old) => [
      ...old,
      { role: "user", text: question },
    ]);

    setInput("");
    loadingRef.current = true;
    setLoading(true);
    setStatus("JARVIS thinking...");

    try {
      const handled = await openCommand(question);

      if (handled) return;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "AI request failed");
      }

      const reply = String(data.reply || "Reply kidaikkala.");

      updateMessages((old) => [
        ...old,
        { role: "assistant", text: reply },
      ]);

      speak(reply);
      setStatus("JARVIS ready");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Something went wrong.";

      updateMessages((old) => [
        ...old,
        { role: "assistant", text: "Error: " + errorMessage },
      ]);

      setStatus("Check API key or server");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  const startListening = useCallback(() => {
    if (!mountedRef.current) return;

    const browser = window as Window & {
      SpeechRecognition?: new () => VoiceRecognition;
      webkitSpeechRecognition?: new () => VoiceRecognition;
    };

    const SpeechAPI =
      browser.SpeechRecognition || browser.webkitSpeechRecognition;

    if (!SpeechAPI) {
      setStatus("Voice unsupported. Try Chrome.");
      voiceModeRef.current = false;
      setVoiceMode(false);
      return;
    }

    try {
      recognitionRef.current?.stop();
    } catch {}

    const recognition = new SpeechAPI();

    recognition.lang = "ta-IN";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      if (!mountedRef.current) return;
      setListening(true);
      setStatus("Listening...");
    };

    recognition.onresult = (event: any) => {
      const heard = String(
        event.results?.[0]?.[0]?.transcript || ""
      ).trim();

      if (!heard) return;

      const command = heard.toLowerCase().replace(/[.!?,]/g, "").trim();

      if (
        /^(stop listening|stop voice mode|exit voice mode)$/.test(command)
      ) {
        voiceModeRef.current = false;
        setVoiceMode(false);
        setStatus("Voice mode stopped");
        return;
      }

      if (/^(voice off|mute voice)$/.test(command)) {
        voiceOnRef.current = false;
        setVoiceOn(false);
        window.speechSynthesis?.cancel();
        setStatus("Voice output OFF");
        return;
      }

      if (/^(voice on|unmute voice)$/.test(command)) {
        voiceOnRef.current = true;
        setVoiceOn(true);
        setStatus("Voice output ON");
        return;
      }

      void sendMessage(heard);
    };

    recognition.onerror = (event: any) => {
      if (!mountedRef.current) return;

      setListening(false);

      if (event.error !== "no-speech" && event.error !== "aborted") {
        setStatus("Mic error: " + event.error);
      }
    };

    recognition.onend = () => {
      if (!mountedRef.current) return;

      setListening(false);

      if (voiceModeRef.current) {
        window.setTimeout(() => {
          if (mountedRef.current && voiceModeRef.current) {
            recognitionRef.current = null;
            startListeningRef.current();
          }
        }, 900);
      } else {
        setStatus("JARVIS ready");
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setStatus("Tap Start Voice again");
    }
  }, [speak]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  function toggleVoiceMode() {
    if (voiceModeRef.current) {
      voiceModeRef.current = false;
      setVoiceMode(false);

      try {
        recognitionRef.current?.stop();
      } catch {}

      setListening(false);
      setStatus("Voice mode stopped");
    } else {
      voiceModeRef.current = true;
      setVoiceMode(true);
      setStatus("Starting voice...");
      startListeningRef.current();
    }
  }

  function toggleVoiceOutput() {
    const next = !voiceOnRef.current;

    voiceOnRef.current = next;
    setVoiceOn(next);

    if (!next && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    setStatus(next ? "Voice output ON" : "Voice output OFF");
  }

  function newChat() {
    if (loadingRef.current) return;

    const chat = makeChat();

    setSessions((old) => [chat, ...old]);
    setActiveId(chat.id);
    setInput("");
    setSidebarOpen(false);
    setStatus("New chat started");
  }

  function selectChat(id: string) {
    if (loadingRef.current) return;

    setActiveId(id);
    setSidebarOpen(false);
    setStatus("Chat opened");
  }

  function deleteChat(id: string) {
    if (loadingRef.current) return;

    const remaining = sessions.filter((chat) => chat.id !== id);

    if (!remaining.length) {
      const chat = makeChat();
      setSessions([chat]);
      setActiveId(chat.id);
    } else {
      setSessions(remaining);

      if (activeId === id) {
        setActiveId(remaining[0].id);
      }
    }

    setStatus("Chat deleted");
  }

  return (
    <main style={s.page}>
      <aside
        style={{
           ...s.sidebar,
           ...(sidebarOpen ? s.sidebarMobileOpen : {}),
           ...(typeof window !== "undefined" && window.innerWidth <= 700
           ? {
              position: "fixed",
              left: sidebarOpen ? 0 : "-300px",
              top: 0,
              bottom: 0,
              width: "280px",
              minWidth: "280px",
              zIndex: 100,
              transition: "left 0.2s ease",
             }
        : {}),
       }}
     >
        <div style={s.sidebarTop}>
          <div style={s.sidebarBrand}>
            <span style={s.brandMark}>J</span>
            <span>JARVIS</span>
          </div>

          <button
            type="button"
            style={s.iconButton}
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
          >
            ✕
          </button>
        </div>

        <button type="button" style={s.newChatSide} onClick={newChat}>
          <span>＋</span> New chat
        </button>

        <div style={s.historyHeading}>RECENT CHATS</div>

        <div style={s.historyList}>
          {sessions.map((chat) => (
            <div
              key={chat.id}
              style={{
                ...s.historyItem,
                ...(chat.id === activeId ? s.historyActive : {}),
              }}
            >
              <button
                type="button"
                style={s.historySelect}
                onClick={() => selectChat(chat.id)}
                title={chat.title}
              >
                <span style={s.historyIcon}>◷</span>
                <span style={s.historyTitle}>{chat.title}</span>
              </button>

              <button
                type="button"
                style={s.deleteButton}
                onClick={() => deleteChat(chat.id)}
                aria-label={`Delete ${chat.title}`}
                title="Delete chat"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div style={s.sidebarBottom}>
          <div style={s.profileCircle}>J</div>
          <div>
            <div style={s.profileName}>JARVIS Assistant</div>
            <div style={s.profileStatus}>AI chat enabled</div>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          type="button"
          style={s.backdrop}
          aria-label="Close sidebar overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <section style={s.mainPanel}>
        <header style={s.header}>
          <div style={s.headerLeft}>
            <button
              type="button"
              style={s.menuButton}
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              ☰
            </button>

            <div>
              <div style={s.headerTitle}>JARVIS <span>AI</span></div>
              <div style={s.headerSubtitle}>
                {listening ? "Listening to you..." : status}
              </div>
            </div>
          </div>

          <button
            type="button"
            style={{
              ...s.voiceToggle,
              ...(voiceOn ? s.voiceToggleOn : {}),
            }}
            onClick={toggleVoiceOutput}
          >
            {voiceOn ? "🔊 Voice ON" : "🔇 Voice OFF"}
          </button>
        </header>

        <section style={s.messages} aria-live="polite" aria-label="Chat messages">
          {messages.length <= 1 && (
            <div style={s.welcome}>
              <div style={s.welcomeBadge}>✦</div>
              <h1 style={s.welcomeTitle}>How can I help you?</h1>
              <p style={s.welcomeText}>
                Ask anything, search the web, or talk to JARVIS.
              </p>

              <div style={s.suggestions}>
                {[
                  "Explain artificial intelligence",
                  "Python na enna?",
                  "Open YouTube",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    style={s.suggestion}
                    onClick={() => void sendMessage(suggestion)}
                    disabled={loading}
                  >
                    <span>✧</span> {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message, index) => {
            if (index === 0 && message.role === "assistant") return null;

            const isUser = message.role === "user";

            return (
              <div
                key={`${activeId}-${index}`}
                style={{
                  ...s.messageRow,
                  justifyContent: isUser ? "flex-end" : "flex-start",
                }}
              >
                {!isUser && <div style={s.assistantAvatar}>J</div>}

                <div
                  style={{
                    ...s.message,
                    ...(isUser ? s.userMessage : s.assistantMessage),
                  }}
                >
                  <div style={s.messageText}>{message.text}</div>

                  {!isUser && (
                    <button
                      type="button"
                      style={s.speakButton}
                      onClick={() => speak(message.text)}
                      title="Read response aloud"
                    >
                        Listen
                    </button>
                  )}
                </div>
              </div>
            );
          })}

            {loading && (
            <div style={s.messageRow}>
              <div style={s.assistantAvatar}>J</div>
              <div style={s.thinking}>
                <span style={s.thinkingDot} />
                <span style={s.thinkingDot} />
                <span style={s.thinkingDot} />
                <span style={s.thinkingText}>JARVIS is thinking...</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </section>

        <footer style={s.composerArea}>
          <button
            type="button"
            style={{
              ...s.voiceModeButton,
              ...(voiceMode ? s.voiceModeActive : {}),
            }}
            onClick={toggleVoiceMode}
          >
            {voiceMode ? "Stop Voice Mode" : "🎙 Start Voice Mode"}
          </button>

          <form
            style={s.composer}
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}
          >
            <input
              style={s.input}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Message JARVIS..."
              aria-label="Message JARVIS"
              autoComplete="off"
            />

            <button
              type="submit"
              style={{
                ...s.sendButton,
                opacity: loading || !input.trim() ? 0.45 : 1,
              }}
              disabled={loading || !input.trim()}
              aria-label="Send message"
            >
              ➤
            </button>
          </form>

          <div style={s.footerNote}>
            JARVIS can make mistakes. Check important information.
          </div>
        </footer>
      </section>
    </main>
  );
}

const s: Record<string, CSSProperties> = {
  page: {
    display: "flex",
    width: "100%",
    height: "100dvh",
    minHeight: "500px",
    overflow: "hidden",
    background: "#0b0d12",
    color: "#edf2f7",
    fontFamily: "Arial, Helvetica, sans-serif",
  },
  sidebar: {
    width: "260px",
    minWidth: "260px",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    background: "#11151d",
    borderRight: "1px solid #252b36",
    padding: "14px 10px",
    boxSizing: "border-box",
    zIndex: 20,
  },
  sidebarTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "4px 7px 20px",
  },
  sidebarBrand: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    fontSize: "15px",
    fontWeight: 800,
    letterSpacing: "2px",
  },
  brandMark: {
    display: "grid",
    placeItems: "center",
    width: "32px",
    height: "32px",
    borderRadius: "11px",
    color: "#a5f3fc",
    background: "#12303b",
    border: "1px solid #236072",
  },
  iconButton: {
    border: 0,
    background: "transparent",
    color: "#a9b5c5",
    fontSize: "16px",
    padding: "7px",
    cursor: "pointer",
  },
  newChatSide: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    width: "100%",
    padding: "12px",
    border: "1px solid #34404e",
    borderRadius: "10px",
    background: "#1b222d",
    color: "#f1f5f9",
    textAlign: "left",
    fontSize: "14px",
    cursor: "pointer",
  },
  historyHeading: {
    color: "#778496",
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "1.5px",
    padding: "24px 10px 10px",
  },
  historyList: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
  },
  historyItem: {
    display: "flex",
    alignItems: "center",
    borderRadius: "8px",
    marginBottom: "4px",
    color: "#c6d0dc",
  },
  historyActive: {
    background: "#222b37",
    color: "#ffffff",
  },
  historySelect: {
    display: "flex",
    alignItems: "center",
    gap: "9px",
    flex: 1,
    minWidth: 0,
    border: 0,
    background: "transparent",
    color: "inherit",
    padding: "10px 8px",
    textAlign: "left",
    cursor: "pointer",
  },
  historyIcon: {
    color: "#8c9bad",
    fontSize: "16px",
    flexShrink: 0,
  },
  historyTitle: {
    fontSize: "12px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  deleteButton: {
    border: 0,
    background: "transparent",
    color: "#8290a1",
    fontSize: "20px",
    padding: "4px 8px",
    cursor: "pointer",
  },
  sidebarBottom: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    borderTop: "1px solid #28303c",
    padding: "15px 5px 5px",
  },
  profileCircle: {
    display: "grid",
    placeItems: "center",
    width: "34px",
    height: "34px",
    borderRadius: "50%",
    background: "#164e63",
    color: "#cffafe",
    fontWeight: 800,
  },
  profileName: { fontSize: "12px", fontWeight: 700 },
  profileStatus: { color: "#8290a1", fontSize: "10px", marginTop: "4px" },
  backdrop: {
    display: "none",
  },
  mainPanel: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    background:
      "radial-gradient(ellipse at top, #111c29 0%, #0b0d12 50%, #0b0d12 100%)",
  },
  header: {
    height: "68px",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    padding: "0 22px",
    borderBottom: "1px solid #242b36",
    background: "rgba(11,13,18,0.92)",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    minWidth: 0,
  },
  menuButton: {
    display: "none",
    border: "1px solid #303947",
    borderRadius: "8px",
    padding: "8px 10px",
    color: "#e2e8f0",
    background: "#171d27",
    cursor: "pointer",
  },
  headerTitle: {
    fontSize: "15px",
    fontWeight: 800,
    letterSpacing: "1.4px",
  },
  headerSubtitle: {
    marginTop: "5px",
    color: "#8493a5",
    fontSize: "11px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  orbSection: {
    position: "relative",
    width: "100%",
    height: "105px",
    flexShrink: 0,
    overflow: "hidden",
  },
  voiceToggle: {
    border: "1px solid #34404e",
    borderRadius: "9px",
    padding: "9px 11px",
    background: "#181e28",
    color: "#cbd5e1",
    fontSize: "11px",
    whiteSpace: "nowrap",
    cursor: "pointer",
  },
  voiceToggleOn: {
    borderColor: "#236072",
    color: "#a5f3fc",
    background: "#10232d",
  },
  messages: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "18px",
    padding: "14px clamp(14px, 5vw, 70px) 25px",
    boxSizing: "border-box",
  },
  welcome: {
    width: "100%",
    maxWidth: "650px",
    margin: "auto",
    textAlign: "center",
    padding: "10px 0 25px",
  },
  welcomeBadge: {
    display: "grid",
    placeItems: "center",
    width: "54px",
    height: "54px",
    margin: "0 auto 18px",
    borderRadius: "18px",
    border: "1px solid #236072",
    background: "#102833",
    color: "#a5f3fc",
    fontSize: "26px",
    boxShadow: "0 0 30px #0e749020",
  },
  welcomeTitle: {
    margin: "0",
    fontSize: "clamp(23px, 4vw, 32px)",
    letterSpacing: "-0.8px",
  },
  welcomeText: {
    margin: "12px 0 24px",
    color: "#8b9aab",
    fontSize: "14px",
    lineHeight: 1.6,
  },
  suggestions: {
    display: "flex",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: "9px",
  },
  suggestion: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    border: "1px solid #303a48",
    borderRadius: "12px",
    padding: "11px 13px",
    background: "#141a23",
    color: "#d2dce7",
    fontSize: "12px",
    cursor: "pointer",
  },
  messageRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    width: "100%",
  },
  assistantAvatar: {
    display: "grid",
    placeItems: "center",
    width: "30px",
    height: "30px",
    flexShrink: 0,
    borderRadius: "10px",
    border: "1px solid #236072",
    background: "#102833",
    color: "#a5f3fc",
    fontWeight: 800,
    fontSize: "13px",
  },
  message: {
    maxWidth: "min(85%, 720px)",
    padding: "13px 15px",
    borderRadius: "15px",
    overflowWrap: "anywhere",
    lineHeight: 1.7,
  },
  userMessage: {
    background: "#183545",
    border: "1px solid #245268",
    color: "#edfaff",
    borderTopRightRadius: "5px",
  },
  assistantMessage: {
    background: "#151a23",
    border: "1px solid #282f3a",
    color: "#e3e9f1",
    borderTopLeftRadius: "5px",
  },
  messageText: {
    whiteSpace: "pre-wrap",
    fontSize: "14px",
  },
  speakButton: {
    display: "block",
    marginTop: "10px",
    padding: "5px 8px",
    border: "1px solid #354453",
    borderRadius: "7px",
    background: "transparent",
    color: "#a5cbd9",
    fontSize: "11px",
    cursor: "pointer",
  },
  thinking: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    border: "1px solid #28313d",
    background: "#151a23",
    borderRadius: "12px",
    padding: "13px",
  },
  thinkingDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: "#67e8f9",
  },
  thinkingText: {
    marginLeft: "6px",
    color: "#9aabba",
    fontSize: "12px",
  },
  composerArea: {
    width: "100%",
    maxWidth: "950px",
    boxSizing: "border-box",
    margin: "0 auto",
    padding: "8px clamp(12px, 4vw, 30px) 12px",
    flexShrink: 0,
  },
  voiceModeButton: {
    display: "block",
    margin: "0 auto 9px",
    border: "1px solid #34404e",
    borderRadius: "9px",
    padding: "8px 13px",
    background: "#171d27",
    color: "#d2dce7",
    fontSize: "11px",
    cursor: "pointer",
  },
  voiceModeActive: {
    background: "#3b1c25",
    borderColor: "#9f3949",
    color: "#fecdd3",
  },
  composer: {
    display: "flex",
    alignItems: "center",
    gap: "9px",
    width: "100%",
    border: "1px solid #35404d",
    borderRadius: "16px",
    padding: "7px",
    background: "#171c25",
    boxSizing: "border-box",
    boxShadow: "0 8px 30px #00000025",
  },
  input: {
    flex: 1,
    minWidth: 0,
    border: 0,
    outline: "none",
    padding: "11px 10px",
    background: "transparent",
    color: "#f1f5f9",
    fontSize: "14px",
  },
  sendButton: {
    width: "40px",
    height: "40px",
    flexShrink: 0,
    border: 0,
    borderRadius: "11px",
    background: "#0e7490",
    color: "#ffffff",
    fontSize: "20px",
    cursor: "pointer",
  },
  footerNote: {
    padding: "9px 0 0",
    textAlign: "center",
    color: "#6f7d8d",
    fontSize: "10px",
  },
};

