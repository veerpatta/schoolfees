# Cache Safety Notes

These `unstable_cache` calls are safe to share across staff users because they only read school operational records scoped by session, class, date, limit, or student id. They do not include `auth.uid()`, staff ids, or per-user visibility rules in the cached result.

`loadDashboardFinancialRows` in `lib/dashboard/data.ts` caches `getWorkbookStudentFinancials({ sessionLabel })`. The underlying workbook view is a shared finance summary for the selected academic session, so every authenticated staff user with dashboard access should see the same rows for the same session.

`loadDashboardTransactions` in `lib/dashboard/data.ts` caches `getWorkbookTransactions` by session, limit, and today-only mode. The transaction list is the same read-only receipt history for staff roles; access is controlled before the dashboard is rendered rather than by user-specific row filtering inside the cached call.

`loadDashboardInstallmentRows` in `lib/dashboard/data.ts` caches `getWorkbookInstallmentRows({ sessionLabel })`. Installment balance rows are session-wide office finance facts and are not personalized to the requesting user.

`getPaymentDeskStudentIndex` and `getPaymentDeskClassOptions` in `lib/payments/data.ts` cache active class/student lookup data by session, class, and limit. These are shared counter workflow lists for staff, not user-owned rows.

`getRecentPaymentDeskReceipts`, `getTodayPaymentDeskCollection`, `getLatestReceiptForStudent`, and `getPaymentDateAwareInstallmentBalances` in `lib/payments/data.ts` cache receipt or balance lookups by session/date, student id, or payment date. These functions read append-only finance records or deterministic payment-preview data and do not filter by the current staff user.

`getActiveSessionStudents` in `lib/defaulters/data.ts` caches active student rows by session, class, and route. The defaulter workflow needs the same active-student baseline for all authorized staff, with page-level permission checks handling access.
