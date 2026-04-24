const dueDates = ["2026-04-20", "2026-07-20", "2026-10-20", "2027-01-20"];

function splitInstallments({ tuition, transport = 0, academic, other = 0, discount = 0 }) {
  const gross = Math.max(0, Math.trunc(tuition + transport + academic + other));
  const discountApplied = Math.min(Math.max(0, Math.trunc(discount)), gross);
  const baseTotalDue = Math.max(0, gross - discountApplied);
  const academicCharge = Math.min(academic, baseTotalDue);
  const remainder = Math.max(0, baseTotalDue - academicCharge);
  const shared = Math.floor(remainder / 4);

  return {
    gross,
    discountApplied,
    baseTotalDue,
    installments: [
      shared + academicCharge,
      shared,
      shared,
      remainder - shared * 3,
    ],
  };
}

function calculateCase(sample) {
  const base = splitInstallments(sample);
  const payments = [...(sample.payments ?? [])].sort((left, right) =>
    left.date.localeCompare(right.date),
  );
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const cumulative = base.installments.map((_, index) =>
    base.installments.slice(0, index + 1).reduce((sum, amount) => sum + amount, 0),
  );
  const rawLate = base.installments.map((_, index) => {
    const dueDate = dueDates[index];
    const paidByDue = payments
      .filter((payment) => payment.date <= dueDate)
      .reduce((sum, payment) => sum + payment.amount, 0);
    const latePayment = payments.some((payment) => payment.date > dueDate);

    return paidByDue < cumulative[index] && totalPaid > paidByDue && latePayment
      ? 1000
      : 0;
  });
  let waiverLeft = sample.waiver ?? 0;
  const finalLate = rawLate.map((late) => {
    const applied = Math.min(late, waiverLeft);
    waiverLeft -= applied;
    return late - applied;
  });
  const totalDue = base.baseTotalDue + finalLate.reduce((sum, amount) => sum + amount, 0);
  const outstanding = Math.max(0, totalDue - totalPaid);

  return { ...base, rawLate, finalLate, totalPaid, totalDue, outstanding };
}

const samples = [
  {
    name: "Old student, no transport",
    tuition: 18000,
    academic: 500,
    expected: { baseTotalDue: 18500, installments: [5000, 4500, 4500, 4500] },
  },
  {
    name: "New student, no transport",
    tuition: 18000,
    academic: 1100,
    expected: { baseTotalDue: 19100, installments: [5600, 4500, 4500, 4500] },
  },
  {
    name: "Late payment with waiver",
    tuition: 18000,
    academic: 500,
    payments: [{ date: "2026-04-25", amount: 1000 }],
    waiver: 500,
    expected: { rawLate: [1000, 0, 0, 0], finalLate: [500, 0, 0, 0], outstanding: 18000 },
  },
  {
    name: "Odd rupee goes to installment 4",
    tuition: 18001,
    academic: 500,
    expected: { installments: [5000, 4500, 4500, 4501] },
  },
];

let failures = 0;

for (const sample of samples) {
  const actual = calculateCase(sample);
  const mismatches = Object.entries(sample.expected).filter(
    ([key, expected]) => JSON.stringify(actual[key]) !== JSON.stringify(expected),
  );

  if (mismatches.length > 0) {
    failures += 1;
    console.error(`FAIL ${sample.name}`);
    for (const [key, expected] of mismatches) {
      console.error(`  ${key}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual[key])}`);
    }
  } else {
    console.log(`PASS ${sample.name}`);
  }
}

if (failures > 0) {
  process.exit(1);
}
