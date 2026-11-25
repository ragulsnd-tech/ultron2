
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `
You are JARVIS, an intelligent personal AI assistant.

LANGUAGE RULES (VERY IMPORTANT):

1. Automatically detect the language and writing style of the latest user message.
2. If the user writes English, reply in English.
3. If the user writes Tamil script, reply in Tamil script.
4. If the user writes Tanglish (Tamil using English letters), reply in Tanglish.
5. If the user mixes English and Tamil, reply in the same mixed style.
6. Support other languages when possible and reply in the user's language.
7. Maintain the user's preferred language style throughout the conversation.
8. Never convert Tanglish into Tamil script unless requested.
9. Never convert Tamil script into Tanglish unless requested.
10. Do not unnecessarily translate the user's message.

PERSONALITY:
- Your name is JARVIS.
- Be intelligent, helpful and friendly.
- Give accurate and useful answers.
- Keep simple answers short.
- Give detailed explanations when requested.
- Understand follow-up questions using conversation history.
- Never claim to perform actions you have not performed.
`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const message =
      typeof body.message === "string" ? body.message.trim() : "";

    const history = Array.isArray(body.history)
      ? body.history
          .filter(
            (item: any) =>
              ["user", "assistant"].includes(item?.role) &&
              typeof item?.content === "string"
          )
          .slice(-10)
          .map((item: any) => ({
            role: item.role,
            content: item.content.slice(0, 5000),
          }))
      : [];

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const accountId = process.env.CF_ACCOUNT_ID;
    const apiToken = process.env.CF_API_TOKEN;
    const model =
      process.env.CF_MODEL ||
      "@cf/meta/llama-3.1-8b-instruct";

    if (!accountId || !apiToken) {
      return NextResponse.json(
        { error: "Cloudflare credentials are missing" },
        { status: 500 }
      );
    }

    const endpoint =
      `https://api.cloudflare.com/client/v4/accounts/` +
      `${accountId}/ai/run/${model}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...history,
            { role: "user", content: message },
          ],
          max_tokens: 1500,
        }),
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok || data.success === false) {
        console.error("Cloudflare AI error:", data);

        return NextResponse.json(
          { error: "Cloudflare AI request failed" },
          { status: response.status || 500 }
        );
      }

      const reply = data.result?.response;

      if (!reply || typeof reply !== "string") {
        return NextResponse.json(
          { error: "Invalid AI response" },
          { status: 502 }
        );
      }

      return NextResponse.json({ reply });

    } finally {
      clearTimeout(timeout);
    }

  } catch (error) {
    console.error("JARVIS API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error && error.name === "AbortError"
            ? "AI request timed out"
            : "Internal server error",
      },
      { status: 500 }
    );
  }
      }
      
