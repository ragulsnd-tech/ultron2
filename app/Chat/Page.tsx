"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import JarvisOrb from "@/components/JarvisOrb";

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

function getLocalDate(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);

  return date.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getUtilityReply(prompt: string): string | null {
  const text = prompt.toLowerCase().trim();

  const dateCommands: [RegExp, number][] = [
    [/^(?:what(?:'s| is)? the date today|date today|today(?:'s)? date|date|today)$/, 0],
    [/^(?:yesterday|yesterday's date|date yesterday|what date was yesterday)$/, -1],
    [/^(?:tomorrow|tomorrow's date|date tomorrow|what date is tomorrow)$/, 1],
    [/^(?:day before yesterday|2 days ago|date 2 days ago)$/, -2],
    [/^(?:day after tomorrow|after tomorrow)$/, 2],
  ];

  for (const [pattern, offset] of dateCommands) {
    if (pattern.test(text)) return getLocalDate(offset);
  }

  const future = text.match(/^after\s+(\d+)\s+days?$/);
  if (future) return getLocalDate(Number(future[1]));

  const past = text.match(/^(\d+)\s+days?\s+ago$/);
  if (past) return getLocalDate(-Number(past[1]));

  if (/^(?:what time is it|current time|time)$/.test(text)) {
    return new Date().toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  if (/^(?:what day is it|day today|today's day)$/.test(text)) {
    return getLocalDate(0).split(",")[0];
  }

  const square = text.match(
    /^(?:calculate\s+)?square\s+of\s+(-?\d+(?:\.\d+)?)$/
  );

  if (square) {
    const n = Number(square[1]);
    return `Square of ${n} is ${n * n}`;
  }

  const percentage = text.match(
    /^(?:calculate\s+)?(-?\d+(?:\.\d+)?)\s*(?:percent|percentage|%)\s+of\s+(-?\d+(?:\.\d+)?)$/
  );

  if (percentage) {
    return `Answer is ${(Number(percentage[1]) / 100) * Number(percentage[2])}`;
  }

  const calc = text.match(/^(?:calculate|what is|what's|solve)\s+(.+)$/);
  const expression = calc ? calc[1] : text;

  if (
    /^[\d\s()+\-*/%.]+$/.test(expression) &&
    /\d/.test(expression) &&
    /[+\-*/%]/.test(expression)
  ) {
    try {
      const result = Function(`"use strict"; return (${expression})`)();

      if (typeof result === "number" && Number.isFinite(result)) {
        return `Answer is ${result}`;
      }
    } catch {
      return "Calculation expression correct-ah type pannu.";
    }
  }

  return null;
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
  const startListeningRef = useRef<() => void>(() => {});

  const activeChat = sessions.find((chat) => chat.id === activeId);
  const messages = activeChat?.messages ?? [WELCOME];

  useEffect(() => {
    let savedSessions: ChatSession[] = [];
    let savedActiveId = "";

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
          savedSessions = parsed as ChatSession[];
        }
      }

      savedActiveId = localStorage.getItem(ACTIVE_KEY) || "";
    } catch {
      savedSessions = [];
    }

    if (savedSessions.length === 0) {
      const firstChat = makeChat();
      savedSessions = [firstChat];
      savedActiveId = firstChat.id;
    }

    if (!savedSessions.some((chat) => chat.id === savedActiveId)) {
      savedActiveId = savedSessions[0].id;
    }

    setSessions(savedSessions);
    setActiveId(savedActiveId);
    setReady(true);

    return () => {
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

  useEffect(() => {
    voiceOnRef.current = voiceOn;

    if (!voiceOn && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, [voiceOn]);

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

  const speak = useCallback((text: string) => {
    if (!voiceOnRef.current || !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();

    const preferred =
      voices.find(
        (voice) =>
          /male|david|mark|guy|daniel|james|george|rishi|fred|alex/i.test(
            voice.name
          ) && /en-IN|en-GB|en-US/i.test(voice.lang)
      ) ||
      voices.find((voice) => /^en-IN$/i.test(voice.lang)) ||
      voices.find((voice) => /^en-GB$/i.test(voice.lang)) ||
      voices.find((voice) => /^en-US$/i.test(voice.lang)) ||
      voices.find((voice) => /^ta/i.test(voice.lang));

    if (preferred) {
      utterance.voice = preferred;
      utterance.lang = preferred.lang;
    } else {
      utterance.lang = "en-IN";
    }

    utterance.rate = 0.9;
    utterance.pitch = 0.85;
    utterance.volume = 1;

    utterance.onstart = () => setStatus("JARVIS speaking...");
    utterance.onend = () => setStatus("JARVIS ready");
    utterance.onerror = () => setStatus("Voice playback error");

    window.speechSynthesis.speak(utterance);
  }, []);

  const toggleVoiceOutput = () => {
    setVoiceOn((previous) => !previous);
  };

  async function openCommand(question: string): Promise<boolean> {
    const text = question.trim();

    const searchMatch = text.match(
      /^(?:google(?:\s+la)?|search(?:\s+google)?|search\s+for)\s+(.+)$/i
    );

    if (searchMatch) {
      const query = searchMatch[1].trim();

      window.open(
        `https://www.google.com/search?q=${encodeURIComponent(query)}`,
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

      return true;
    }

    const appMatch = text.match(
      /^(?:jarvis[, ]*)?(?:open|launch|start)\s+(.+?)(?:\s+app)?[.!?]*$/i
    );

    if (!appMatch) return false;

    const appName = appMatch[1].trim().toLowerCase();

    const appLinks: Record<string, string> = {
      youtube: "https://www.youtube.com/",
      whatsapp: "https://web.whatsapp.com/",
      instagram: "https://www.instagram.com/",
      telegram: "https://web.telegram.org/",
      gmail: "https://mail.google.com/",
      google: "https://www.google.com/",
      wikipedia: "https://www.wikipedia.org/",
    };

    const url = appLinks[appName];

    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      setStatus(`${appName} opening...`);
      return true;
    }

    updateMessages((old) => [
      ...old,
      {
        role: "assistant",
        text: `"${appName}"-ku website link set pannala.`,
      },
    ]);

    return true;
}
    const sendMessage = async (text?: string) => {
    const prompt = (text ?? input).trim();

    if (!prompt || loading) return;

    setInput("");
    setStatus("JARVIS processing...");

    if (/^(voice off|stop voice|mute voice)$/i.test(prompt)) {
       recognitionRef.current?.stop();
       setVoiceMode(false);
       voiceModeRef.current = false;
       setListening(false);
       setStatus("Chat mode ready");

       updateMessages((old) => [
         ...old,
         { role: "user", text: prompt },
         {
            role: "assistant",
            text: "Voice mode off. Chat mode ready.",
         },
       ]);

       return;
    }

    if (/^(voice on|start voice)$/i.test(prompt)) {
      setVoiceMode(true);
      voiceModeRef.current = true;
      setStatus("Voice mode ready");
      updateMessages((old) => [
         ...old,
         { role: "user", text: prompt },
       ]);
      return;
    }

    if (/^(clear chat|new chat)$/i.test(prompt)) {
      newChat();
      return;
    }

    if (/^(close jarvis|exit jarvis|quit jarvis)$/i.test(prompt)) {
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
      setVoiceMode(false);
      voiceModeRef.current = false;
      setStatus("JARVIS stopped");
      return;
    }

    const utilityReply = getUtilityReply(prompt);

    if (utilityReply) {
      const updated = [
        ...messages,
        { role: "user" as const, text: prompt },
        { role: "assistant" as const, text: utilityReply },
      ];

      updateMessages(() =>
  updated.map((message) => ({
    role: message.role,
    text: "text" in message ? message.text : "",
  }))
);
      setStatus("JARVIS ready");

      if (voiceOn) speak(utilityReply);
      return;
    }

    const handled = await openCommand(prompt);

    if (handled) {
      const updated = [
        ...messages,
        { role: "user" as const, text: prompt },
        {
          role: "assistant" as const,
          text: "Okay. Command processed.",
        },
      ];

      updateMessages(() =>
  updated.map((message) => ({
    role: message.role,
    text: message.text,
  }))
);
      setStatus("JARVIS ready");
      return;
    }

    const updatedMessages: Message[] = [
      ...messages,
      { role: "user", text: prompt },
    ];

    updateMessages(() => updatedMessages);
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prompt,
          history: updatedMessages.map((item) => ({
            role: item.role,
            content: item.text,
          })),
          chatId: activeId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "JARVIS API error");
      }

      const reply =
        data.reply ||
        data.response ||
        data.text ||
        "JARVIS couldn't generate a reply.";

      updateMessages(() => [
  ...updatedMessages,
  { role: "assistant", text: reply },
]);

      setStatus("JARVIS ready");

      if (voiceOn) speak(reply);
    } catch (error) {
  const errorText =
    error instanceof Error
      ? error.message
      : "Something went wrong.";

  updateMessages((old) => [
    ...old,
    {
      role: "assistant",
      text: `JARVIS error: ${errorText}`,
    },
  ]);
      setStatus("Connection error");
    } finally {
      setLoading(false);
    }
  };

  const startListening = useCallback(() => {
    if (loading) return;

    const browserWindow = window as Window & {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
};
const SpeechRecognitionAPI =
  typeof window !== "undefined"
    ? (
        window as Window & {
          SpeechRecognition?: new () => SpeechRecognition;
          webkitSpeechRecognition?: new () => SpeechRecognition;
        }
      ).SpeechRecognition ||
      (
        window as Window & {
          SpeechRecognition?: new () => SpeechRecognition;
          webkitSpeechRecognition?: new () => SpeechRecognition;
        }
      ).webkitSpeechRecognition
    : undefined;

    if (!SpeechRecognitionAPI) {
      setStatus("Speech recognition not supported. Use Chrome.");
      return;
    }

    try {
      recognitionRef.current?.stop();

      const recognition = new SpeechRecognitionAPI();
      recognition.lang = "en-IN";
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setListening(true);
        setStatus("Listening...");
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim();

        if (transcript) {
          setInput(transcript);
          setListening(false);
          setStatus("Processing voice...");
          void sendMessage(transcript);
        }
      };

      recognition.onerror = () => {
        setListening(false);
        setStatus("Voice input error. Try again.");
      };

      recognition.onend = () => {
        setListening(false);
        setStatus((current) =>
          current === "Listening..." ? "JARVIS ready" : current
        );
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setListening(false);
      setStatus("Couldn't start microphone. Check permission.");
    }
  }, [loading, messages, input, voiceOutput, activeId]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  const toggleVoiceMode = () => {
    if (voiceMode) {
      recognitionRef.current?.stop();
      setVoiceMode(false);
      voiceModeRef.current = false;
      setListening(false);
      setStatus("Chat mode ready");
    } else {
      setVoiceMode(true);
      voiceModeRef.current = true;
      setStatus("Voice mode ready");
      window.setTimeout(() => {
        startListeningRef.current?.();
      }, 300);
    }
  };

  const newChat = () => {
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();

    const chat = makeChat();

    setChats((previous) => [chat, ...previous]);
    setActiveId(chat.id);
    setMessages([WELCOME]);
    setInput("");
    setLoading(false);
    setStatus("New chat ready");

    try {
      localStorage.setItem(ACTIVE_KEY, chat.id);
    } catch {}
  };

  const selectChat = (chat: ChatSession) => {
    recognitionRef.current?.stop();
    setActiveId(chat.id);
    setMessages(chat.messages.length ? chat.messages : [WELCOME]);
    setInput("");
    setStatus("JARVIS ready");

    try {
      localStorage.setItem(ACTIVE_KEY, chat.id);
    } catch {}
  };

  const deleteChat = (id: string) => {
    setChats((previous) => {
      const remaining = previous.filter((chat) => chat.id !== id);

      if (remaining.length === 0) {
        const fresh = makeChat();
        setActiveId(fresh.id);
        setMessages([WELCOME]);
        return [fresh];
      }

      if (activeId === id) {
        setActiveId(remaining[0].id);
        setMessages(
          remaining[0].messages.length
            ? remaining[0].messages
            : [WELCOME]
        );
      }

      return remaining;
    });
  };

  return (
    <div style={s.app}>
      <aside style={s.sidebar}>
        <div style={s.sidebarHeader}>
          <div style={s.brand}>
            <div style={s.brandIcon}>J</div>
            <div>
              <div style={s.headerTitle}>JARVIS</div>
              <div style={s.headerSubtitle}>PERSONAL AI</div>
            </div>
          </div>

          <button
            style={s.iconButton}
            onClick={newChat}
            title="New chat"
          >
            +
          </button>
        </div>

        <button style={s.newChatButton} onClick={newChat}>
          <span>＋</span> New chat
        </button>

        <div style={s.historyTitle}>RECENT CHATS</div>

        <div style={s.historyList}>
          {chats.map((chat) => (
            <div
              key={chat.id}
              style={{
                ...s.historyRow,
                ...(chat.id === activeId ? s.activeHistory : {}),
              }}
            >
              <button
                style={s.historyButton}
                onClick={() => selectChat(chat)}
              >
                <span style={s.historyDot}>●</span>
                <span style={s.historyText}>{chat.title}</span>
              </button>

              <button
                style={s.deleteButton}
                title="Delete chat"
                onClick={() => deleteChat(chat.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div style={s.sidebarFooter}>
          JARVIS AI · Chat + Voice
        </div>
      </aside>

      <main style={s.main}>
        <header style={s.header}>
          <div style={s.headerInfo}>
            <div style={s.headerTitle}>JARVIS Assistant</div>
            <div style={s.headerSubtitle}>{status}</div>
          </div>

          <button
            style={{
              ...s.voiceButton,
              ...(voiceMode ? s.voiceButtonActive : {}),
            }}
            onClick={toggleVoiceMode}
          >
            {voiceMode ? "Voice mode ON" : "Start voice mode"}
          </button>
        </header>

        {voiceMode && (
          <section style={s.voicePanel}>
            <div style={s.orbCanvas}>
              <JarvisOrb compact />
            </div>

            <div style={s.voiceStatus}>
              {listening ? "Listening to you..." : status}
            </div>

            <div style={s.voiceControls}>
              <button style={s.listenButton} onClick={startListening}>
                {listening ? "Listening..." : "🎙 Start listening"}
              </button>

              <button
                style={{
                  ...s.outputButton,
                  ...(voiceOutput ? s.voiceButtonActive : {}),
                }}
                onClick={toggleVoiceOutput}
              >
                {voiceOutput ? "Voice output ON" : "Voice output OFF"}
              </button>
            </div>
          </section>
        )}

        <section style={s.messages}>
          {messages.length === 1 &&
          messages[0].content === WELCOME.content ? (
            <div style={s.welcome}>
              <div style={s.welcomeIcon}>✦</div>
              <h1 style={s.welcomeTitle}>Vanakkam! I'm JARVIS.</h1>
              <p style={s.welcomeText}>
                Ask me anything, type a message, or use voice mode.
              </p>

              <div style={s.suggestions}>
                {[
                  "Explain artificial intelligence",
                  "Open Google",
                  "What time is it?",
                  "Tell me a joke",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    style={s.suggestion}
                    onClick={() => void sendMessage(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={`${activeId}-${index}`}
                style={{
                  ...s.messageRow,
                  ...(message.role === "user" ? s.userMessageRow : {}),
                }}
              >
                <div style={s.avatar}>
                  {message.role === "user" ? "YOU" : "J"}
                </div>

                <div
                  style={{
                    ...s.messageBubble,
                    ...(message.role === "user" ? s.userBubble : s.assistantBubble),
                  }}
                >
                  <div style={s.messageRole}>
                    {message.role === "user" ? "You" : "JARVIS"}
                  </div>

                  <div style={s.messageContent}>
                    {message.content}
                  </div>

                  {message.role === "assistant" && (
                    <button
                      style={s.outputButton}
                      onClick={() => speak(message.content)}
                    >
                      🔊 Speak
                    </button>
                  )}
                </div>
              </div>
            ))
          )}

          {loading && (
            <div style={s.loadingText}>JARVIS is thinking...</div>
          )}

          <div ref={bottomRef} />
        </section>

        <section style={s.composerArea}>
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
              disabled={loading}
            />

            <button
              style={s.micButton}
              onClick={startListening}
              title="Speak"
              disabled={loading}
            >
              🎙
            </button>

            <button
              style={s.sendButton}
              onClick={() => void sendMessage()}
              disabled={loading || !input.trim()}
            >
              {loading ? "..." : "➤"}
            </button>
          </div>

          <div style={s.disclaimer}>
            JARVIS can make mistakes. Check important information.
          </div>
        </section>
      </main>
    </div>
  );
    }
  const s: Record<string, CSSProperties> = {
  app: {
    display: "flex",
    width: "100%",
    height: "100dvh",
    background: "#080b14",
    color: "#edf2ff",
    fontFamily: "Arial, sans-serif",
    overflow: "hidden",
  },
  sidebar: {
    width: 260,
    minWidth: 220,
    display: "flex",
    flexDirection: "column",
    background: "#0d1220",
    borderRight: "1px solid #202a40",
    padding: 16,
    boxSizing: "border-box",
  },
  sidebarHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  brandIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    background: "linear-gradient(135deg,#00d9ff,#6655ff)",
    color: "#fff",
    fontWeight: 800,
    fontSize: 22,
  },
  iconButton: {
    background: "#182239",
    border: "1px solid #2b3a57",
    color: "#e8f4ff",
    borderRadius: 10,
    width: 36,
    height: 36,
    fontSize: 22,
    cursor: "pointer",
  },
  newChatButton: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #263955",
    background: "#121c30",
    color: "#e7f5ff",
    textAlign: "left",
    cursor: "pointer",
    fontSize: 14,
  },
  historyTitle: {
    marginTop: 28,
    marginBottom: 12,
    color: "#8191ae",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 2,
  },
  historyList: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
    overflowY: "auto",
    flex: 1,
  },
  historyRow: {
    display: "flex",
    alignItems: "center",
    borderRadius: 9,
    background: "transparent",
  },
  activeHistory: {
    background: "#17253b",
  },
  historyButton: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
    padding: "11px 8px",
    border: "none",
    background: "transparent",
    color: "#dbe7fa",
    textAlign: "left",
    cursor: "pointer",
  },
  historyDot: {
    color: "#16c8ee",
    fontSize: 8,
  },
  historyText: {
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    fontSize: 12,
  },
  deleteButton: {
    border: "none",
    background: "transparent",
    color: "#8390a8",
    fontSize: 20,
    cursor: "pointer",
    padding: "4px 8px",
  },
  sidebarFooter: {
    paddingTop: 16,
    borderTop: "1px solid #202a40",
    color: "#8290aa",
    fontSize: 11,
  },
  main: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minWidth: 0,
    height: "100%",
  },
  header: {
    minHeight: 66,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 22px",
    borderBottom: "1px solid #202a40",
    boxSizing: "border-box",
  },
  headerInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    color: "#8b9bb8",
    fontSize: 11,
  },
  voiceButton: {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #2b3c58",
    background: "#121b2c",
    color: "#dcecff",
    cursor: "pointer",
    fontSize: 12,
    whiteSpace: "nowrap",
  },
  voiceButtonActive: {
    background: "#073c46",
    borderColor: "#00c8df",
    color: "#8ff4ff",
  },
  voicePanel: {
    padding: 16,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    borderBottom: "1px solid #202a40",
    background: "#0b1120",
  },
  orbCanvas: {
    width: 150,
    height: 150,
    position: "relative",
    overflow: "hidden",
  },
  voiceStatus: {
    color: "#9bdff5",
    fontSize: 12,
    textAlign: "center",
  },
  voiceControls: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  listenButton: {
    padding: "10px 14px",
    border: "1px solid #00bcd4",
    borderRadius: 10,
    background: "#07313c",
    color: "#b8f8ff",
    cursor: "pointer",
  },
  outputButton: {
    padding: "7px 10px",
    border: "1px solid #2b3c58",
    borderRadius: 8,
    background: "#121b2c",
    color: "#c7d9f5",
    cursor: "pointer",
    fontSize: 11,
  },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "24px clamp(14px, 5vw, 70px)",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  welcome: {
    margin: "auto",
    width: "100%",
    maxWidth: 600,
    textAlign: "center",
    padding: "28px 0",
  },
  welcomeIcon: {
    margin: "0 auto 20px",
    width: 64,
    height: 64,
    display: "grid",
    placeItems: "center",
    borderRadius: 22,
    background: "linear-gradient(135deg,#063746,#25215b)",
    border: "1px solid #17627c",
    color: "#6beaff",
    fontSize: 32,
  },
  welcomeTitle: {
    fontSize: "clamp(23px, 4vw, 34px)",
    margin: "0 0 12px",
  },
  welcomeText: {
    color: "#94a4c0",
    fontSize: 14,
    lineHeight: 1.7,
  },
  suggestions: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 9,
    marginTop: 25,
  },
  suggestion: {
    padding: "11px 13px",
    border: "1px solid #293b58",
    borderRadius: 12,
    background: "#10192a",
    color: "#d7e7ff",
    cursor: "pointer",
    fontSize: 12,
  },
  messageRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    width: "100%",
  },
  userMessageRow: {
    flexDirection: "row-reverse",
  },
  avatar: {
    width: 32,
    height: 32,
    minWidth: 32,
    display: "grid",
    placeItems: "center",
    borderRadius: 11,
    background: "#15263c",
    border: "1px solid #2c4665",
    color: "#70eaff",
    fontSize: 10,
    fontWeight: 700,
  },
  messageBubble: {
    maxWidth: "85%",
    padding: "13px 15px",
    borderRadius: 14,
    lineHeight: 1.7,
    overflowWrap: "anywhere",
  },
  userBubble: {
    background: "#12344a",
    border: "1px solid #20516a",
    borderTopRightRadius: 4,
  },
  assistantBubble: {
    background: "#111827",
    border: "1px solid #253248",
    borderTopLeftRadius: 4,
  },
  messageRole: {
    marginBottom: 7,
    color: "#7eddf5",
    fontSize: 11,
    fontWeight: 700,
  },
  messageContent: {
    whiteSpace: "pre-wrap",
    fontSize: 14,
  },
  loadingText: {
    color: "#7eddf5",
    fontSize: 12,
    padding: "5px 0",
  },
  composerArea: {
    padding: "12px clamp(12px, 4vw, 48px) 10px",
    borderTop: "1px solid #202a40",
    background: "#0b101b",
  },
  composer: {
    display: "flex",
    alignItems: "flex-end",
    gap: 8,
    maxWidth: 900,
    margin: "0 auto",
    padding: 8,
    border: "1px solid #2b3a53",
    borderRadius: 16,
    background: "#111827",
  },
  textarea: {
    flex: 1,
    minWidth: 0,
    maxHeight: 150,
    resize: "vertical",
    padding: "10px 8px",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "#f1f6ff",
    fontFamily: "inherit",
    fontSize: 14,
    lineHeight: 1.6,
  },
  micButton: {
    width: 40,
    height: 40,
    border: "1px solid #30435e",
    borderRadius: 11,
    background: "#18243a",
    color: "#b8eaff",
    cursor: "pointer",
  },
  sendButton: {
    width: 40,
    height: 40,
    border: "none",
    borderRadius: 11,
    background: "linear-gradient(135deg,#00bdd7,#5755f5)",
    color: "#fff",
    fontSize: 19,
    cursor: "pointer",
  },
  disclaimer: {
    paddingTop: 9,
    textAlign: "center",
    color: "#6e7c95",
    fontSize: 10,
  },
};
