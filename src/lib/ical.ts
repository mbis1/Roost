export type CalendarEvent = {
  uid: string;
  summary: string;
  startDate: string;
  endDate: string;
  description: string;
  source: string;
};

export function parseICal(icalString: string, sourcePlatform: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const lines = icalString.split("\n").map((l) => l.trim());
  let currentEvent: Partial<CalendarEvent> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      currentEvent = { source: sourcePlatform };
    } else if (line === "END:VEVENT" && currentEvent) {
      if (currentEvent.uid && currentEvent.startDate) {
        events.push(currentEvent as CalendarEvent);
      }
      currentEvent = null;
    } else if (currentEvent) {
      if (line.startsWith("UID:")) currentEvent.uid = line.substring(4);
      else if (line.startsWith("SUMMARY:")) currentEvent.summary = line.substring(8);
      else if (line.startsWith("DTSTART")) currentEvent.startDate = parseICalDate(line);
      else if (line.startsWith("DTEND")) currentEvent.endDate = parseICalDate(line);
      else if (line.startsWith("DESCRIPTION:")) currentEvent.description = line.substring(12).replace(/\\n/g, "\n");
    }
  }
  return events;
}

function parseICalDate(line: string): string {
  const match = line.match(/(\d{4})(\d{2})(\d{2})/);
  if (match) return match[1] + "-" + match[2] + "-" + match[3];
  return "";
}

export async function fetchAndParseICal(url: string, platform: string): Promise<CalendarEvent[]> {
  if (!url) return [];
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch iCal: " + response.status);
    const text = await response.text();
    return parseICal(text, platform);
  } catch (error) {
    console.error("iCal fetch error:", error);
    return [];
  }
}

export function isDateBooked(date: string, events: CalendarEvent[]): { booked: boolean; event?: CalendarEvent } {
  for (const event of events) {
    if (date >= event.startDate && date < event.endDate) return { booked: true, event };
  }
  return { booked: false };
}

export function getBookedRanges(events: CalendarEvent[]) {
  return events.map((e) => ({ start: e.startDate, end: e.endDate, guest: e.summary || "Blocked", platform: e.source }));
}

export function generateICal(events: CalendarEvent[], propertyName: string): string {
  let ical = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Roost//Property Manager//EN\nCALSCALE:GREGORIAN\nX-WR-CALNAME:" + propertyName + "\n";
  for (const event of events) {
    ical += "BEGIN:VEVENT\nUID:" + event.uid + "\nDTSTART;VALUE=DATE:" + event.startDate.replace(/-/g, "") + "\nDTEND;VALUE=DATE:" + event.endDate.replace(/-/g, "") + "\nSUMMARY:" + (event.summary || "Booked") + "\n";
    if (event.description) ical += "DESCRIPTION:" + event.description.replace(/\n/g, "\\n") + "\n";
    ical += "END:VEVENT\n";
  }
  ical += "END:VCALENDAR";
  return ical;
}
