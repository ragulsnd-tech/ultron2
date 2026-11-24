
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    // 1. Read message
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
    const gatewayId = process.env.CF_GATEWAY_ID;

    // Default model; change through Render environment variables
    const model =
      process.env.CF_MODEL ||
      "@cf/meta/llama-3.1-8b-instruct";

    if (!accountId || !apiToken || !gatewayId) {
      return NextResponse.json(
        {
          error: "Cloudflare environment variables missing."
        },
        { status: 500 }
      );
    }

    // 3. Cloudflare AI Gateway endpoint
    const url =
      `https://api.cloudflare.com/client/v4/accounts/` +
      `${encodeURIComponent(accountId)}/ai/v1/chat/completions`;

    // 4. Request timeout
    timeout = setTimeout(() => controller.abort(), 30000);

    // 5. Send request to Cloudflare Workers AI
    const result = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "cf-aig-gateway-id": gatewayId,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `You are JARVIS, a fast and helpful AI assistant.

Reply directly in 1-4 short sentences by default.
Use Tamil or Tanglish when the user does.
Avoid long introductions and repetition.
Give detailed explanations only when asked.
Be accurate, friendly and helpful.`
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

    // 6. Read response
    const data = await result.json();

    if (!result.ok) {
      console.error("Cloudflare AI Error:", data);

      return NextResponse.json(
        {
          error:
            data?.errors?.[0]?.message ||
            data?.error?.message ||
            "Cloudflare AI request failed."
        },
        { status: 502 }
      );
    }

    // 7. Extract AI response
    const reply =
      data?.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return NextResponse.json(
        { error: "JARVIS received an empty response." },
        { status: 502 }
      );
    }

    // 8. Return response to JARVIS frontend
    return NextResponse.json({ reply });

  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      return NextResponse.json(
        {
          error: "JARVIS response timed out. Try again."
        },
        { status: 504 }
      );
    }

    console.error("JARVIS Server Error:", error);

    return NextResponse.json(
      {
        error: "Server error. Cloudflare connection check pannu."
      },
      { status: 500 }
    );

  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
