export type AIContext = {
  propertyName: string; guestName: string; guestMessage: string;
  wifi: string; wifiPassword: string; lockCode: string;
  checkIn: string; checkOut: string; address: string;
  rules: { quietHours: string; parking: string; pets: string; smoking: string; maxGuests: string; checkInInstructions: string; checkOutInstructions: string; };
  tone: "friendly" | "formal" | "casual";
};

const SYSTEM_PROMPT = `You are an AI assistant for a short-term rental property manager. You draft responses to guest messages. Be helpful, warm, and concise. Always use the property-specific information provided to give accurate answers. Never make up information. Keep responses under 150 words unless the question requires more detail.`;

function buildPrompt(ctx: AIContext): string {
  return `${SYSTEM_PROMPT}\n\nPROPERTY INFO:\n- Name: ${ctx.propertyName}\n- Address: ${ctx.address}\n- WiFi: ${ctx.wifi} / Password: ${ctx.wifiPassword}\n- Lock Code: ${ctx.lockCode}\n- Check-in: ${ctx.checkIn} | Check-out: ${ctx.checkOut}\n- Quiet Hours: ${ctx.rules.quietHours}\n- Parking: ${ctx.rules.parking}\n- Pets: ${ctx.rules.pets}\n- Smoking: ${ctx.rules.smoking}\n- Max Guests: ${ctx.rules.maxGuests}\n- Check-in Instructions: ${ctx.rules.checkInInstructions}\n- Check-out Instructions: ${ctx.rules.checkOutInstructions}\n\nTONE: ${ctx.tone}\n\nGUEST "${ctx.guestName}" SAYS:\n"${ctx.guestMessage}"\n\nDraft a response:`;
}

export async function generateAIDraft(ctx: AIContext, provider: string = "huggingface", apiKey: string = ""): Promise<string> {
  if (!apiKey) return fallbackResponse(ctx);
  try {
    if (provider === "groq") return await callGroq(buildPrompt(ctx), apiKey);
    if (provider === "huggingface") return await callHuggingFace(ctx, apiKey);
    return fallbackResponse(ctx);
  } catch (error) { console.error("AI generation failed:", error); return fallbackResponse(ctx); }
}

/**
 * Sprint B.4 — refine a workflow draft. Used by the run-step endpoint
 * to give a templated message a more natural, host-tone polish before
 * sending to Telegram for approval. Returns the draft unchanged on
 * configuration / network failure.
 */
export async function refineWorkflowDraft(opts: {
  rawTemplate: string;
  propertyName: string;
  tone: "friendly" | "formal" | "casual";
  provider: string;
  apiKey: string;
}): Promise<string> {
  const { rawTemplate, propertyName, tone, provider, apiKey } = opts;
  if (!apiKey) return rawTemplate;
  const prompt =
    `You are an assistant helping a short-term rental host send guest messages. ` +
    `Below is a templated message about the property "${propertyName}". The tone target is "${tone}". ` +
    `Lightly polish the wording so it reads naturally. Keep all {{placeholder}} tokens EXACTLY as-is — ` +
    `do not resolve them, do not invent values. Keep the message length similar. Do not add greetings ` +
    `or sign-offs that aren't already there. Return ONLY the polished message text.\n\n` +
    `Message:\n${rawTemplate}`;
  try {
    if (provider === "groq") return await callGroq(prompt, apiKey);
    if (provider === "huggingface") {
      // The HF inference API for the existing model returns raw completions.
      const out = await callHuggingFaceRaw(prompt, apiKey);
      return out || rawTemplate;
    }
    return rawTemplate;
  } catch (e) {
    console.error("refineWorkflowDraft failed:", e);
    return rawTemplate;
  }
}

async function callHuggingFace(ctx: AIContext, apiKey: string): Promise<string> {
  const out = await callHuggingFaceRaw(buildPrompt(ctx), apiKey);
  if (out) return out;
  throw new Error("Unexpected HuggingFace response format");
}

async function callHuggingFaceRaw(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch("https://api-inference.huggingface.co/models/meta-llama/Meta-Llama-3-8B-Instruct", {
    method: "POST", headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 300, temperature: 0.7, top_p: 0.9, return_full_text: false } }),
  });
  if (!response.ok) throw new Error("HuggingFace API error: " + response.status);
  const data = await response.json();
  if (Array.isArray(data) && data[0]?.generated_text) return data[0].generated_text.trim();
  return "";
}

/**
 * Groq via OpenAI-compatible /chat/completions. Free tier model:
 * llama-3.1-8b-instant (fast, ~200ms). Returns the assistant text.
 */
async function callGroq(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content:
            "You are a concise, helpful assistant for a short-term rental host. " +
            "Keep responses focused and natural.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 400,
      temperature: 0.7,
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Groq API error: ${response.status} ${text}`);
  }
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  throw new Error("Unexpected Groq response format");
}

function fallbackResponse(ctx: AIContext): string {
  const msg = ctx.guestMessage.toLowerCase();
  if (msg.includes("wifi") || msg.includes("internet") || msg.includes("password"))
    return `Hi ${ctx.guestName}! The WiFi network is "${ctx.wifi}" and the password is "${ctx.wifiPassword}". If you have any trouble connecting, try restarting the router. Let me know if you need anything else!`;
  if (msg.includes("check in") || msg.includes("check-in") || msg.includes("arrive"))
    return `Hi ${ctx.guestName}! Check-in is at ${ctx.checkIn}. ${ctx.rules.checkInInstructions || "Your lock code is " + ctx.lockCode + "."} The address is ${ctx.address}. Safe travels!`;
  if (msg.includes("check out") || msg.includes("check-out") || msg.includes("checkout"))
    return `Hi ${ctx.guestName}! Check-out is at ${ctx.checkOut}. ${ctx.rules.checkOutInstructions || "Please lock up when you leave."} We hope you enjoyed your stay!`;
  if (msg.includes("park") || msg.includes("parking") || msg.includes("car"))
    return `Hi ${ctx.guestName}! ${ctx.rules.parking || "Parking is available at the property."} Let me know if you need any other info!`;
  if (msg.includes("pet") || msg.includes("dog") || msg.includes("cat"))
    return `Hi ${ctx.guestName}! Our pet policy: ${ctx.rules.pets || "Please check with us about pets."}`;
  if (msg.includes("early") && msg.includes("check"))
    return `Hi ${ctx.guestName}! Our standard check-in is ${ctx.checkIn} as our cleaning crew needs time to prepare. You're welcome to drop off luggage. I'll do my best to get you in early if possible!`;
  if (msg.includes("late") && msg.includes("check"))
    return `Hi ${ctx.guestName}! Late check-out depends on availability. I'll check if there's a booking after yours. Standard check-out is ${ctx.checkOut}.`;
  return `Hi ${ctx.guestName}! Thank you for your message. I'll look into this and get back to you shortly.\n\nWiFi: ${ctx.wifi} / ${ctx.wifiPassword}\nLock: ${ctx.lockCode}\nCheck-in: ${ctx.checkIn} | Check-out: ${ctx.checkOut}\n\nLet me know if you need anything else!`;
}

export function generateWelcomeLetter(
  property: { name: string; address: string; wifi_name: string; wifi_password: string; lock_code: string; check_in_time: string; check_out_time: string },
  rules: Partial<AIContext["rules"]>
): string {
  const lines: string[] = [
    "Welcome to " + property.name + "!", "", "CHECK-IN",
    rules.checkInInstructions || ("Check-in time: " + property.check_in_time),
    "Lock code: " + property.lock_code, "Address: " + property.address,
    "", "WIFI", "Network: " + property.wifi_name, "Password: " + property.wifi_password, "", "HOUSE RULES",
  ];
  if (rules.quietHours) lines.push("- Quiet hours: " + rules.quietHours);
  if (rules.parking) lines.push("- Parking: " + rules.parking);
  if (rules.pets) lines.push("- Pets: " + rules.pets);
  if (rules.smoking) lines.push("- Smoking: " + rules.smoking);
  if (rules.maxGuests) lines.push("- Max guests: " + rules.maxGuests);
  lines.push("", "CHECKOUT", rules.checkOutInstructions || ("Check-out time: " + property.check_out_time), "", "Enjoy your stay!");
  return lines.join("\n");
}
