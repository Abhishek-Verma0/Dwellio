/** Formatting helpers shared by the card, the price breakdown and the trips list. */

const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** 12500 -> "₹12,500". Intl handles the Indian digit grouping (1,25,000). */
export const formatPrice = (amount: number) => rupees.format(amount);

/** "entire_place" -> "Entire place" — the API's enum, in human words. */
export const roomTypeLabel = (roomType: string) =>
  roomType.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
