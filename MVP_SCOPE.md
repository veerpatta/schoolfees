# MVP_SCOPE.md

## MVP Goal

Deliver a dependable internal fee office app for VPPS that can replace the
most important spreadsheet/manual tasks first without losing auditability.

## In Scope

The MVP should focus on these working areas:

- student master records
- fee settings by class/session
- payment entry for office/accounts staff
- append-only collection history
- ledger visibility per student
- printable receipts
- dashboard summary
- defaulters / outstanding reporting
- staff login and protected access

## Core User Jobs

An office or accounts user should be able to:

1. add or update a student master record
2. define or review the active fee structure
3. generate or review expected installment amounts
4. record a payment against the correct student and ledger item
5. print or reprint a receipt
6. review dues, defaulters, and collection summaries
7. trace who changed what and when

## Required Product Behavior

These are MVP-level behavior requirements, not optional polish:

- payment history must remain traceable
- historical payments must not be rewritten casually
- correction flows should use adjustments/reversals
- receipts need stable identifiers
- office staff should not need to understand technical concepts
- the UI should optimize for speed, clarity, and low error rates

## Out Of Scope For Now

Unless explicitly requested, keep these out of MVP:

- parent portal features
- online self-service parent payments
- multi-school or tenant architecture
- complex fee-rule engines for many custom schools
- mobile-app-first redesign
- BI-style analytics beyond practical admin reporting
- PDF receipt generation (printable HTML view exists; server-side PDF is not built)
- automated fee-payment reconciliation with bank statements

## Import Scope Position

Student spreadsheet import is now implemented as a staged workflow:
upload, column mapping, dry-run validation, review row-level issues,
import valid rows only, keep batch and row traceability.

This remains a migration aid, not the center of the product. Manual
workflows always take priority over import automation.

## Delivery Priorities

Build in this order when choices compete:

1. correctness
2. auditability
3. usability for office staff
4. operational speed
5. visual polish

## Acceptance Lens For Future Work

A proposed MVP feature is a good fit if it:

- reduces spreadsheet/manual effort
- helps staff enter or verify fee data
- improves receipt, ledger, or dues accuracy
- preserves history and accountability
- fits an internal-admin app for one school

A proposed MVP feature is a poor fit if it:

- assumes public users
- adds multi-tenant complexity
- encourages direct editing of historical finance records
- makes the workflow prettier but less reliable
