
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    // 1. Read user message
    let body: { message?: unknown };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 }
      );
    }

    const message = body.message;

    if (typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { error: "Message type pannu." },
        { status: 400 }
      );
    }

    // 2. Cloudflare configuration
    const accountId = process.env.CF_ACCOUNT_ID;
    const apiToken = process.env.CF_API_TOKEN;

    const model =
      process.env.CF_MODEL ||
      "@cf/meta/llama-3.1-8b-instruct";

    if (!accountId || !apiToken) {
      return NextResponse.json(
        {
          error: "Cloudflare Account ID or API Token missing."
        },
        { status: 500 }
      );
    }

    // 3. Direct Workers AI API
    const url =
      `https://api.cloudflare.com/client/v4/accounts/` +
      `${encodeURIComponent(accountId)}/ai/run/` +
      `${model.split("/").map(encodeURIComponent).join("/")}`;

    // 4. Timeout
    timeout = setTimeout(
      () => controller.abort(),
      30000
    );

    // 5. Send AI request
    const result = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: `You are JARVIS, a fast and intelligent AI assistant.

Reply in Tamil or Tanglish when the user uses Tamil or Tanglish.
Reply in English when the user uses English.
Give short, direct answers by default.
Provide detailed explanations when requested.
Be accurate, helpful and friendly.`
          },
          {
            role: "user",
            content: message.trim()
          }
        ],
        max_tokens: 500,
        temperature: 0.5
      })
    });

    // 6. Read Cloudflare response
    const data = await result.json();

    if (!result.ok || data.success === false) {
      console.error("Cloudflare AI Error:", data);

      return NextResponse.json(
        {
          error:
            data.errors?.[0]?.message ||
            "Cloudflare Workers AI request failed."
        },
        { status: 502 }
      );
    }

    // 7. Extract AI response
    const reply =
      data.result?.response?.trim();

    if (!reply) {
      return NextResponse.json(
        { error: "JARVIS received an empty response." },
        { status: 502 }
      );
    }

    // 8. Return to frontend
    return NextResponse.json({ reply });

  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      return NextResponse.json(
        { error: "JARVIS response timed out. Try again." },
        { status: 504 }
      );
    }

    console.error("JARVIS Server Error:", error);

    return NextResponse.json(
      { error: "Cloudflare AI connection failed." },
      { status: 500 }
    );

  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
