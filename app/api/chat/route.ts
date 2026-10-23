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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    let result: Response;

    try {
      result = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: message.trim() }],
              },
            ],
            systemInstruction: {
              parts: [
                {
                  text: `You are JARVIS, a fast and helpful AI assistant.
Reply directly in 1-4 short sentences by default.
Use Tamil or Tanglish when the user does.
Avoid long introductions and repetition.
Give detailed explanations only when asked.`,
                },
              ],
            },
            generationConfig: {
              maxOutputTokens: 200,
              temperature: 0.5,
            },
          }),
        }
      );
    } finally {
      clearTimeout(timeout);
    }

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
        .join("")
        .trim() || "Reply kidaikkala.";

    return NextResponse.json({ reply });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { error: "JARVIS response late aaguthu. Konjam neram kazhichu try pannu." },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: "Server error. API connection check pannu." },
      { status: 500 }
    );
  }
      }
