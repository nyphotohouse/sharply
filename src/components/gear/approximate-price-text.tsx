export function ApproximatePriceText({ value }: { value: string }) {
  if (!value.startsWith("~")) return value;

  return (
    <>
      <span className="text-muted-foreground">~</span>
      {value.slice(1)}
    </>
  );
}
