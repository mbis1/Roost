import { NextRequest, NextResponse } from "next/server";
import { generateAIDraft, type AIContext } from "@/lib/ai";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider, apiKey, ...context } = body;
    const draft = await generateAIDraft(context as AIContext, provider || "huggingface", apiKey || "");
    return NextResponse.json({ success: true, draft, generated_at: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ error: "Failed to generate draft", details: String(error) }, { status: 500 });
  }
}
