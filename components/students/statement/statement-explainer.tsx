/**
 * The one paragraph that stops the four tiles being misread.
 *
 * A written-off amount clears a balance but is not money the school received.
 * Every complaint this document exists to pre-empt starts with someone adding
 * "paid" and "written off" together and asking why the balance disagrees.
 */
export function StatementExplainer({ isFamily }: { isFamily: boolean }) {
  return (
    <p className="mb-2 border-l-[3px] border-border-strong pl-2.5 text-[11.5px] leading-[1.5] text-muted-foreground">
      {isFamily
        ? "Each student is charged on their own class rate; transport is charged per student on the route they use. "
        : ""}
      Written-off amounts clear a balance but are{" "}
      <strong className="text-foreground">not</strong> counted as paid —{" "}
      <em>still payable</em> is the only figure the office collects against, and it covers fees plus
      any late fee already charged.
    </p>
  );
}
