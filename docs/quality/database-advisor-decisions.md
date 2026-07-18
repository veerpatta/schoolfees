# Database advisor decisions

Database advisors are inputs to investigation, not an instruction to add or remove every index.

- `workbook_materialized_view_refresh_queue` has RLS with no client policy intentionally. It is a service-only scheduling queue.
- `mv_student_sibling_groups` is an authenticated read optimization. Students and Fee Setup remain the source of truth.
- The workbook financial materialized views are authenticated read models. Their source tables retain RLS and the payment mutation path retains permission, locking, duplicate, and idempotency checks.
- Zero-use duplicate-payment and idempotency indexes must not be removed.
- Remaining hot-query work requires a measured `EXPLAIN (ANALYZE, BUFFERS)` and a matching workload before adding an index. Write amplification is part of the decision.

The July hardening migration removes general client access from the five Notion projections, makes them security-invoker views, grants their dedicated role SELECT-only dependency access, restricts receipt adjustment inserts to payment writers, revokes anonymous recovery refresh execution, and pins mutable function search paths.
