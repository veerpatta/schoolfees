export function resolveReceiptSessionLabel(input: {
  paymentSessionLabels: readonly (string | null | undefined)[];
  studentSessionLabel?: string | null;
}) {
  const paymentSessionLabel = input.paymentSessionLabels.find(
    (label): label is string => typeof label === "string" && label.trim().length > 0,
  );

  return paymentSessionLabel?.trim() || input.studentSessionLabel?.trim() || "Unknown session";
}
