export type CalcInput = {
  platform: "Airbnb" | "VRBO" | "Direct";
  nightlyRate: number;
  nights: number;
  cleaningFee: number;
  discountPercent: number;
  extraGuests: number;
  extraGuestFeePerNight: number;
  airbnbHostFeePct: number;
  airbnbGuestFeePct: number;
  vrboHostFeePct: number;
  vrboGuestFeePct: number;
  taxRate: number;
};

export type CalcResult = {
  subtotal: number;
  cleaningFee: number;
  extraGuestTotal: number;
  discountAmount: number;
  preFeeTotal: number;
  guestServiceFee: number;
  taxes: number;
  guestTotal: number;
  hostServiceFee: number;
  hostPayout: number;
  effectiveNightlyRate: number;
  platform: string;
  hostFeeRate: number;
  guestFeeRate: number;
};

export function calculateBooking(input: CalcInput): CalcResult {
  const subtotal = input.nightlyRate * input.nights;
  const extraGuestTotal = input.extraGuests * input.extraGuestFeePerNight * input.nights;
  const discountAmount = subtotal * (input.discountPercent / 100);
  const preFeeTotal = subtotal + input.cleaningFee + extraGuestTotal - discountAmount;

  let hostFeeRate = 0;
  let guestFeeRate = 0;

  switch (input.platform) {
    case "Airbnb":
      hostFeeRate = input.airbnbHostFeePct;
      guestFeeRate = input.airbnbGuestFeePct;
      break;
    case "VRBO":
      hostFeeRate = input.vrboHostFeePct;
      guestFeeRate = input.vrboGuestFeePct;
      break;
    case "Direct":
      hostFeeRate = 0;
      guestFeeRate = 0;
      break;
  }

  const guestServiceFee = preFeeTotal * (guestFeeRate / 100);
  const taxes = (preFeeTotal + guestServiceFee) * (input.taxRate / 100);
  const guestTotal = preFeeTotal + guestServiceFee + taxes;

  const hostServiceFee = preFeeTotal * (hostFeeRate / 100);
  const hostPayout = preFeeTotal - hostServiceFee;
  const effectiveNightlyRate = input.nights > 0 ? hostPayout / input.nights : 0;

  return {
    subtotal, cleaningFee: input.cleaningFee, extraGuestTotal, discountAmount,
    preFeeTotal, guestServiceFee, taxes, guestTotal, hostServiceFee,
    hostPayout, effectiveNightlyRate, platform: input.platform,
    hostFeeRate, guestFeeRate,
  };
}

export function generateReplyTemplate(result: CalcResult, nights: number, rate: number): string {
  let reply = "The total for " + nights + " nights would be $" + result.guestTotal.toFixed(2);
  if (result.guestServiceFee > 0) {
    reply += " (includes " + result.platform + " service fee)";
  }
  reply += ". That's $" + rate + "/night";
  if (result.cleaningFee > 0) {
    reply += " + $" + result.cleaningFee + " cleaning fee";
  }
  if (result.discountAmount > 0) {
    reply += " with a discount applied";
  }
  reply += ".";
  return reply;
}

export function checkMonthlyTarget(
  effectiveNightlyRate: number,
  monthlyTarget: number
): { nightsNeeded: number; achievable: boolean } {
  if (effectiveNightlyRate <= 0) return { nightsNeeded: 999, achievable: false };
  const nightsNeeded = Math.ceil(monthlyTarget / effectiveNightlyRate);
  return { nightsNeeded, achievable: nightsNeeded <= 25 };
}
