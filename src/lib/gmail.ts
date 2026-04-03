import { supabase } from "./supabase";

export type ParsedGuestMessage = {
  emailId: string;
  platform: "Airbnb" | "VRBO" | "Booking.com" | "Unknown";
  guestName: string;
  propertyName: string;
  bookingDates: string;
  messageText: string;
  receivedAt: string;
  subject: string;
};

export type GmailMessage = {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: string;
};

// Detect which platform sent the email
export function detectPlatform(fromEmail: string, subject: string): "Airbnb" | "VRBO" | "Booking.com" | "Unknown" {
  const from = fromEmail.toLowerCase();
  const subj = subject.toLowerCase();

  if (from.includes("airbnb") || from.includes("@airbnb.com") || subj.includes("airbnb")) return "Airbnb";
  if (from.includes("vrbo") || from.includes("homeaway") || from.includes("@vrbo.com") || subj.includes("vrbo")) return "VRBO";
  if (from.includes("booking.com") || from.includes("@booking.com") || subj.includes("booking.com")) return "Booking.com";
  return "Unknown";
}

// Parse a single email into a structured guest message
export function parseEmailToGuestMessage(
  fromEmail: string,
  subject: string,
  body: string,
  emailId: string,
  receivedAt: string
): ParsedGuestMessage | null {
  const platform = detectPlatform(fromEmail, subject);
  if (platform === "Unknown") return null;

  let guestName = "";
  let propertyName = "";
  let bookingDates = "";
  let messageText = "";

  if (platform === "Airbnb") {
    // Parse Airbnb notification email format
    const nameMatch = body.match(/(?:from|message from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]?\.?)?)/i);
    guestName = nameMatch ? nameMatch[1].trim() : "Guest";

    const propertyMatch = body.match(/(?:for|at|listing[:\s]+)\s*([^.\n]+?)(?:\s*(?:on|for|from|\.|$))/i);
    propertyName = propertyMatch ? propertyMatch[1].trim() : "";

    const dateMatch = body.match(/(\w+\s+\d{1,2})\s*[-–]\s*(\w+\s+\d{1,2}(?:,?\s*\d{4})?)/);
    bookingDates = dateMatch ? dateMatch[0].trim() : "";

    const msgMatch = body.match(/(?:message|wrote|says)[:\s]*\n?([\s\S]*?)(?:\n\n|Reply|Respond|View|$)/i);
    messageText = msgMatch ? msgMatch[1].trim() : extractMessageBody(body);
  } else if (platform === "VRBO") {
    const nameMatch = body.match(/(?:from|traveler|guest)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]?\.?)?)/i);
    guestName = nameMatch ? nameMatch[1].trim() : "Guest";

    const propertyMatch = body.match(/(?:property|listing)[:\s]+([^\n]+)/i);
    propertyName = propertyMatch ? propertyMatch[1].trim() : "";

    const dateMatch = body.match(/(\w+\s+\d{1,2})\s*[-–]\s*(\w+\s+\d{1,2}(?:,?\s*\d{4})?)/);
    bookingDates = dateMatch ? dateMatch[0].trim() : "";

    const msgMatch = body.match(/(?:message|inquiry)[:\s]*\n?([\s\S]*?)(?:\n\n|Reply|Respond|View|$)/i);
    messageText = msgMatch ? msgMatch[1].trim() : extractMessageBody(body);
  } else if (platform === "Booking.com") {
    const nameMatch = body.match(/(?:from|guest)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]?\.?)?)/i);
    guestName = nameMatch ? nameMatch[1].trim() : "Guest";

    const propertyMatch = body.match(/(?:property|accommodation)[:\s]+([^\n]+)/i);
    propertyName = propertyMatch ? propertyMatch[1].trim() : "";

    const dateMatch = body.match(/(\d{1,2}\s+\w+)\s*[-–]\s*(\d{1,2}\s+\w+(?:\s+\d{4})?)/);
    bookingDates = dateMatch ? dateMatch[0].trim() : "";

    messageText = extractMessageBody(body);
  }

  if (!messageText && !guestName) return null;

  return {
    emailId,
    platform,
    guestName: guestName || "Guest",
    propertyName,
    bookingDates,
    messageText: messageText || subject,
    receivedAt,
    subject,
  };
}

function extractMessageBody(body: string): string {
  // Strip HTML tags if present
  let text = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  // Try to extract the core message content
  const patterns = [
    /(?:message|wrote|says)[:\s]*([\s\S]{10,300})/i,
    /(?:Hi|Hello|Hey)[,\s]*([\s\S]{10,300})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim().substring(0, 500);
  }

  // Return first meaningful chunk
  return text.substring(0, 500);
}

// Match parsed property name to a property in Supabase
export async function matchPropertyByName(propertyName: string): Promise<string | null> {
  if (!propertyName) return null;

  const { data: properties } = await supabase.from("properties").select("id, name, address");
  if (!properties || properties.length === 0) return null;

  const normalized = propertyName.toLowerCase().trim();

  // Exact match first
  const exact = properties.find(
    (p) => p.name.toLowerCase() === normalized || p.address.toLowerCase().includes(normalized)
  );
  if (exact) return exact.id;

  // Fuzzy match - check if property name words appear in the parsed name
  for (const prop of properties) {
    const words = prop.name.toLowerCase().split(/\s+/);
    const matchCount = words.filter((w: string) => w.length > 2 && normalized.includes(w)).length;
    if (matchCount >= 2 || (words.length <= 2 && matchCount >= 1)) return prop.id;
  }

  // If only one property, default to it
  if (properties.length === 1) return properties[0].id;

  return null;
}

// Store parsed message in Supabase (creates conversation or adds to existing)
export async function storeGuestMessage(parsed: ParsedGuestMessage): Promise<string | null> {
  try {
    const propertyId = await matchPropertyByName(parsed.propertyName);
    if (!propertyId) {
      console.error("Could not match property:", parsed.propertyName);
      return null;
    }

    // Check if conversation already exists for this guest + property
    const { data: existing } = await supabase
      .from("messages")
      .select("id")
      .eq("property_id", propertyId)
      .eq("guest_name", parsed.guestName)
      .eq("platform", parsed.platform)
      .order("created_at", { ascending: false })
      .limit(1);

    let messageId: string;

    if (existing && existing.length > 0) {
      // Add to existing conversation
      messageId = existing[0].id;
      await supabase.from("messages").update({
        last_message_preview: parsed.messageText.substring(0, 100),
        last_message_at: parsed.receivedAt,
        unread: true,
      }).eq("id", messageId);
    } else {
      // Create new conversation
      const { data: newMsg, error } = await supabase.from("messages").insert({
        property_id: propertyId,
        guest_name: parsed.guestName,
        platform: parsed.platform,
        status: "inquiry",
        booking_dates: parsed.bookingDates,
        unread: true,
        last_message_preview: parsed.messageText.substring(0, 100),
        last_message_at: parsed.receivedAt,
      }).select("id").single();

      if (error || !newMsg) {
        console.error("Failed to create message:", error);
        return null;
      }
      messageId = newMsg.id;
    }

    // Add message thread entry
    await supabase.from("message_threads").insert({
      message_id: messageId,
      sender: "guest",
      text: parsed.messageText,
      sent_at: parsed.receivedAt,
      approved: true,
    });

    return messageId;
  } catch (error) {
    console.error("Store guest message error:", error);
    return null;
  }
}

// Fetch recent Airbnb/VRBO emails from Gmail API
export async function fetchRecentGmailMessages(
  accessToken: string,
  maxResults: number = 20
): Promise<GmailMessage[]> {
  const messages: GmailMessage[] = [];

  try {
    // Search for rental platform emails
    const query = encodeURIComponent("from:(airbnb OR vrbo OR homeaway OR booking.com) newer_than:1d");
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=${maxResults}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!listRes.ok) {
      console.error("Gmail list error:", listRes.status);
      return [];
    }

    const listData = await listRes.json();
    if (!listData.messages) return [];

    for (const msg of listData.messages) {
      try {
        const detailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!detailRes.ok) continue;
        const detail = await detailRes.json();

        const headers = detail.payload?.headers || [];
        const from = headers.find((h: any) => h.name.toLowerCase() === "from")?.value || "";
        const subject = headers.find((h: any) => h.name.toLowerCase() === "subject")?.value || "";
        const date = headers.find((h: any) => h.name.toLowerCase() === "date")?.value || "";

        let body = "";
        if (detail.payload?.body?.data) {
          body = Buffer.from(detail.payload.body.data, "base64").toString("utf-8");
        } else if (detail.payload?.parts) {
          const textPart = detail.payload.parts.find(
            (p: any) => p.mimeType === "text/plain" && p.body?.data
          );
          if (textPart) {
            body = Buffer.from(textPart.body.data, "base64").toString("utf-8");
          } else {
            const htmlPart = detail.payload.parts.find(
              (p: any) => p.mimeType === "text/html" && p.body?.data
            );
            if (htmlPart) {
              body = Buffer.from(htmlPart.body.data, "base64").toString("utf-8");
            }
          }
        }

        messages.push({
          id: msg.id,
          threadId: msg.threadId || msg.id,
          from,
          subject,
          body,
          receivedAt: date ? new Date(date).toISOString() : new Date().toISOString(),
        });
      } catch (e) {
        console.error("Error fetching message detail:", e);
      }
    }
  } catch (error) {
    console.error("Gmail fetch error:", error);
  }

  return messages;
}

// Process all new emails end-to-end
export async function processNewEmails(
  accessToken: string
): Promise<{ processed: number; stored: number; errors: string[] }> {
  const errors: string[] = [];
  let stored = 0;

  const emails = await fetchRecentGmailMessages(accessToken);

  for (const email of emails) {
    try {
      // Check if we already processed this email
      const { data: existing } = await supabase
        .from("message_threads")
        .select("id")
        .eq("text", email.id)
        .limit(1);

      if (existing && existing.length > 0) continue;

      const parsed = parseEmailToGuestMessage(
        email.from,
        email.subject,
        email.body,
        email.id,
        email.receivedAt
      );

      if (!parsed) continue;

      const messageId = await storeGuestMessage(parsed);
      if (messageId) {
        stored++;
      } else {
        errors.push(`Could not store message from ${parsed.guestName} (${parsed.platform})`);
      }
    } catch (e) {
      errors.push(`Error processing email ${email.id}: ${String(e)}`);
    }
  }

  return { processed: emails.length, stored, errors };
}
