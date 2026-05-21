export type FamilyAllocationInput = {
  studentId: string;
  outstandingAmount: number;
};

export type FamilyAllocation = FamilyAllocationInput & {
  allocatedAmount: number;
  creditAmount: number;
};

export type FamilyAllocationValidation = {
  valid: boolean;
  driftAmount: number;
};

/** Builds deterministic pro-rata child allocations while preserving the exact family total. */
export function buildProRataFamilyAllocations(
  children: FamilyAllocationInput[],
  totalAmount: number,
): FamilyAllocation[] {
  const normalizedTotal = Math.max(Math.floor(totalAmount), 0);
  const normalizedChildren = children.map((child) => ({
    studentId: child.studentId,
    outstandingAmount: Math.max(Math.floor(child.outstandingAmount), 0),
  }));
  const pendingTotal = normalizedChildren.reduce((sum, child) => sum + child.outstandingAmount, 0);

  if (normalizedChildren.length === 0) {
    return [];
  }

  if (pendingTotal === 0) {
    const base = Math.floor(normalizedTotal / normalizedChildren.length);
    let remainder = normalizedTotal - base * normalizedChildren.length;

    return normalizedChildren.map((child) => {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      const allocatedAmount = base + extra;

      return {
        ...child,
        allocatedAmount,
        creditAmount: allocatedAmount,
      };
    });
  }

  const provisional = normalizedChildren.map((child, index) => {
    const exact = (normalizedTotal * child.outstandingAmount) / pendingTotal;
    const floorAmount = Math.floor(exact);

    return {
      child,
      index,
      floorAmount,
      fraction: exact - floorAmount,
    };
  });
  let remainder = normalizedTotal - provisional.reduce((sum, item) => sum + item.floorAmount, 0);
  const ordered = [...provisional].sort((left, right) => {
    if (right.fraction !== left.fraction) {
      return right.fraction - left.fraction;
    }

    return left.index - right.index;
  });
  const extras = new Map<string, number>();

  for (const item of ordered) {
    if (remainder <= 0) {
      break;
    }

    extras.set(item.child.studentId, (extras.get(item.child.studentId) ?? 0) + 1);
    remainder -= 1;
  }

  return provisional.map((item) => {
    const allocatedAmount = item.floorAmount + (extras.get(item.child.studentId) ?? 0);

    return {
      ...item.child,
      allocatedAmount,
      creditAmount: Math.max(allocatedAmount - item.child.outstandingAmount, 0),
    };
  });
}

/** Checks whether per-child allocations exactly match the submitted family total. */
export function validateFamilyAllocationSum(
  allocations: Array<Pick<FamilyAllocation, "allocatedAmount">>,
  totalAmount: number,
): FamilyAllocationValidation {
  const allocatedTotal = allocations.reduce((sum, item) => sum + Math.max(Math.floor(item.allocatedAmount), 0), 0);
  const normalizedTotal = Math.max(Math.floor(totalAmount), 0);

  return {
    valid: allocatedTotal === normalizedTotal,
    driftAmount: allocatedTotal - normalizedTotal,
  };
}

/** Returns the credit overflow in a child allocation. */
export function getFamilyAllocationCredit(allocation: Pick<FamilyAllocation, "allocatedAmount" | "outstandingAmount">) {
  return Math.max(
    Math.max(Math.floor(allocation.allocatedAmount), 0) - Math.max(Math.floor(allocation.outstandingAmount), 0),
    0,
  );
}
