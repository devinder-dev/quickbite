const STAGES = ["placed", "accepted", "cooking", "ready"] as const;

// Extracted out of OrderStatus.tsx so the persistent ActiveOrderBanner can
// render the identical stage tracker without duplicating it.
export function OrderStages({ status }: { status: string }) {
  const currentIndex = STAGES.indexOf(status as (typeof STAGES)[number]);

  return (
    <ol className="order-stages">
      {STAGES.map((stage, index) => (
        <li key={stage} aria-current={index === currentIndex} data-done={index <= currentIndex}>
          {stage}
        </li>
      ))}
    </ol>
  );
}
