# Payments Lib

Domain for Payment Desk search, previews, posting workflow, and receipt data.

Paired route/components: `/protected/payments`, `components/payments`.

Preserve append-only payment and receipt semantics. Posting must keep
idempotency, locking, and date-aware workbook snapshot alignment.

Use this folder for payment workflow logic, not student master edits or fee
policy publishing.
