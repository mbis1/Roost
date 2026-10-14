-- supabase-glenolden-ai-knowledge.sql
--
-- The knowledge note Roost's AI uses when it drafts replies about
-- Glenolden (email alerts, later guest replies). Stored as
-- property_details section "ai_knowledge" → data.text.
-- Source: project folder 06 Properties/Glenolden (Facts, Rules, Q&A,
-- Issue Log, Vendors), 2026-10-13. NO door codes, lock codes or WiFi
-- password in here — the AI must never send those.
-- Safe to re-run (upsert). Edit the text here and re-run to update.

insert into property_details (property_id, section, data, updated_at)
select '86c49685-2b57-4d96-8131-a60773bc9d4c', 'ai_knowledge', jsonb_build_object('text', $k$
GLENOLDEN — 611 Glenolden Ct., Cary, NC 27513. 3BR/2BA condo, max 6 people. Owner: Joanna (919-349-9778). HOA: CPHOA Board.

LAYOUT & QUIRKS
- Master bedroom has an adjustable bed. 2 spare bedrooms, 2 bathrooms.
- Outdoor shed holds the breaker panel. In winter keep the shed light ON (it warms the pipes).
- Master closet door: front panel is detaching — don't fully close it (handyman fix pending).
- Master + spare bedroom doors don't latch reliably (heat cycling rattles them); only the half-bath door latches. Handyman fix pending.
- Some bedroom bulbs are screwed in very tight — tenants should NOT try to remove them; Rick (handyman) replaces bulbs.
- Thermostat is programmable, not remote-controlled. "Hold temperature until…" on the screen is the schedule, not a fault.
- Front glass storm door is sometimes locked from inside by cleaners — use the back door and unlock the storm door from inside.

LOCKS
- Yale smart keypads on front and back doors (separate locks; either can fail on its own). Tap screen, enter code, it unlocks.
- Low-battery alerts go to the owner. Fix: Joanna ships batteries via Amazon to the condo and the tenant swaps them (or Rick can do it).
- Never put a door code in a reply.

APPLIANCES
- Dishwasher: newer 24" unit (Lowes replaced the old Frigidaire). Error i40 = clogged filter/sump: clean the filter/sump at the bottom, then reset the dishwasher breaker in the shed. If it keeps happening, Mr. Appliance.
- Washer: Roper. Past problem: cycle ran but didn't drain/spin — fixed by Mr. Appliance.
- Internet: Spectrum (networks spectrum32-Wifi-5G / spectrum32-Wifi-2G). If WiFi is down: unplug the router/modem 30 seconds and plug back in; if still down it's a Spectrum outage.

MAIL, PACKAGES, PARKING, TRASH
- Mailbox 1, left of the building as you face the stairs; key on the wall shelf in the kitchen.
- Packages are dropped at the door — include the apartment number when ordering.
- Parking: spot marked 611 only; other numbered spots get towed. Unmarked spots on the side of the building are fine.
- Trash: two dumpsters down the street behind a gate (visible from the back porch). Pickup Wednesdays; recycling every other Wednesday (Thursday on holiday weeks). Household trash only, must go INSIDE the dumpster (overflow = cleanup charge to the owner). If one is full, use the other.
- No grease or oil down the kitchen sink.

COLD WEATHER (near/below freezing)
- Drip faucets overnight, open cabinet doors under sinks, keep heat at 55°F or higher if away, keep the shed light ON.

VENDORS (who to send)
- Rick Crane — handyman, (845) 519-7352: doors, lighting/bulbs, general fixes, small plumbing, screens, batteries. Default for repairs.
- Mr. Appliance — appliance repair (dishwasher, washer, dryer, fridge). Scheduled by the owner; their tech may call the tenant directly to set a time.
- Lowes — appliance replacement/installation.
- Lupita — cleaner, (919) 746-6408.
- When a vendor is sent, the owner usually shares the vendor's direct number with the tenant so they can agree on a time.

REPAIR HISTORY
- Dishwasher i40 / not draining — old unit replaced with a new 24" unit (Lowes).
- Washer not draining/spinning — repaired (Mr. Appliance).
- Yale low batteries — recurring; batteries shipped, tenant replaces.
- Interior doors not latching, closet door panel, bedroom bulbs — open, assigned to Rick.
- Shower door drip strip can catch on the bottom — lift and reseat it.

GENERAL ANSWERS
- Visitors are fine.
- Owner prefers email with this tenant; tenant also has the owner's phone number.
$k$), now()
where exists (select 1 from properties where id = '86c49685-2b57-4d96-8131-a60773bc9d4c')
on conflict (property_id, section) do update set data = excluded.data, updated_at = now();
