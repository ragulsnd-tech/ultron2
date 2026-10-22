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

        <div style={s.orbSection}>
          <JarvisOrb compact />
        </div>

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
                      🔊 Listen
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {loading && (
            <div style={s.messageRow}>
              <div style={s.assistantAvatar}>J</div>
              <div style={s.
