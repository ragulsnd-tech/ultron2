
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { message } = await request.json();
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || "gemini-flash-latest";

    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini API key setup pannala." },
        { status: 500 }
      );
    }

    if (typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { error: "Message type pannu." },
        { status: 400 }
      );
    }

    const result = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: message }],
            },
          ],
          systemInstruction: {
            parts: [
              {
                text: "You are ULTRON, a helpful AI assistant. Reply in Tamil or Tanglish when appropriate.",
              },
            ],
          },
        }),
      }
    );

    const data = await result.json();

    if (!result.ok) {
      return NextResponse.json(
        { error: data.error?.message || "Gemini request failed." },
        { status: result.status }
      );
    }

    const reply =
      data.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text || "")
        .join("") || "Reply kidaikkala.";

    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json(
      { error: "Server error." },
      { status: 500 }
    );
  }
}
