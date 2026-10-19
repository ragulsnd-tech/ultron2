
"use client";

import { useEffect, useRef, useState } from "react";

type Message = {
  role: "user" | "assistant";
  text: string;
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "Vanakkam! Naan U.L.T.R.O.N. Unakku enna help venum?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function speak(text: string) {
    if (!voiceEnabled || typeof window === "undefined") return;
    if (!("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ta-IN";
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }

  async function sendMessage(text = input) {
    const question = text.trim();
    if (!question || loading) return;

    setInput("");
    setMessages((old) => [...old, { role: "user", text: question }]);
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "AI response failed");
      }

      const answer =
        data.reply || data.response || data.text || "Reply kidaikkala.";

      setMessages((old) => [...old, { role: "assistant", text: answer }]);
      speak(answer);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      setMessages((old) => [
        ...old,
        {
          role: "assistant",
          text: `Error: ${errorMessage}. API setup check pannu.`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function toggleVoiceInput() {
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      alert("Voice input support illa. Android Chrome-la try pannu.");
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "ta-IN";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setListening(false);
    };

    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  return (
    <main className="chat-page">
      <header className="chat-header">
        <a href="/" className="chat-back">← Home</a>
        <div>
          <h1>U.L.T.R.O.N.</h1>
          <p>AI CHAT + VOICE</p>
        </div>
        <button
          className="chat-voice-toggle"
          onClick={() => {
            setVoiceEnabled((old) => !old);
            if (voiceEnabled) window.speechSynthesis?.cancel();
          }}
        >
          {voiceEnabled ? "🔊 Voice ON" : "🔇 Voice OFF"}
        </button>
      </header>

      <section className="chat-messages">
        {messages.map((message, index) => (
          <article
            key={index}
            className={`chat-bubble ${
              message.role === "user" ? "chat-user" : "chat-ai"
            }`}
          >
            <small>{message.role === "user" ? "YOU" : "ULTRON"}</small>
            <p>{message.text}</p>
            {message.role === "assistant" && (
              <button
                className="chat-speak"
                onClick={() => speak(message.text)}
              >
                🔊 Speak
              </button>
            )}
          </article>
        ))}

        {loading && <p className="chat-loading">ULTRON is thinking...</p>}
        <div ref={bottomRef} />
      </section>

      <form
        className="chat-input-area"
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage();
        }}
      >
        <button
          type="button"
          className={`chat-mic ${listening ? "chat-mic-active" : ""}`}
          onClick={toggleVoiceInput}
          aria-label="Voice input"
        >
          {listening ? "⏹" : "🎙️"}
        </button>

        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={listening ? "Pesunga..." : "Message ULTRON..."}
          aria-label="Message"
        />

        <button type="submit" disabled={loading || !input.trim()}>
          Send ➤
        </button>
      </form>

      <p className="chat-note">
        Voice availability browser and Android language settings-ai depend pannum.
      </p>
    </main>
  );
              }

