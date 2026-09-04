/**
 * The App Router renders with Next's vendored React canary, which exports
 * `ViewTransition`; @types/react only declares it behind the canary entry.
 * Referencing it here makes the type visible everywhere without changing
 * which React runs.
 */
/// <reference types="react/canary" />
