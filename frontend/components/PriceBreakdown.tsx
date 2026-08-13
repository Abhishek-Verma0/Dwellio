import { formatPrice } from "@/lib/format";

/**
 * The same arithmetic the backend does:
 *   total = nightly x nights + cleaning_fee + service_fee
 *
 * Shown here so the guest sees where the number comes from — but the server
 * recomputes it on POST /bookings and ignores anything the client sends. This
 * is a preview of the price, never the source of it.
 */
export function PriceBreakdown({
  nightlyRate,
  nights,
  cleaningFee,
  serviceFee,
}: {
  nightlyRate: number;
  nights: number;
  cleaningFee: number;
  serviceFee: number;
}) {
  const nightsTotal = nightlyRate * nights;
  const total = nightsTotal + cleaningFee + serviceFee;

  return (
    <div className="space-y-3 text-body">
      <Row
        // "x 3 nights" is doing real work here: it explains the multiplication
        // rather than just labelling the number.
        label={`${formatPrice(nightlyRate)} x ${nights} ${nights === 1 ? "night" : "nights"}`}
        value={nightsTotal}
      />
      {cleaningFee > 0 && <Row label="Cleaning fee" value={cleaningFee} />}
      {serviceFee > 0 && <Row label="Service fee" value={serviceFee} />}

      <div className="flex items-baseline justify-between border-t border-line pt-4">
        <span className="font-medium">Total</span>
        <span className="tabular font-display text-price">{formatPrice(total)}</span>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-slate underline decoration-line underline-offset-4">{label}</span>
      <span className="tabular shrink-0">{formatPrice(value)}</span>
    </div>
  );
}
