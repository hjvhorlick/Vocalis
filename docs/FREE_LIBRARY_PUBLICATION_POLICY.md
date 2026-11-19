# Vocalis Free Library publication and revocation policy

**Version:** 1.0 — 2026-11-18

The Free Voice Library distributes only approved *derived files*, never a protected Original Voice Library import. Each public package must contain the WAV, the `vocalis-free-library/v1` publication manifest, attribution/licence notices, the supported-use scope, and a visible disclosure such as **Derived source-clip WAV** or **AI-created derived audio**.

## Publication gate

Before a file is offered publicly, `createFreeLibraryManifest()` verifies:

- candidate review state and recorded listener review;
- parent/source and output SHA-256 values;
- immutable creation manifest with matching hashes;
- attribution, licence notices, supported-use scope and disclosure; and
- a consent-record ID for any AI-created file.

The browser's **Manifest** button runs that verification before it creates a download. Passing this local check is not a substitute for an independent rights review.

## Contributor and rights requirements

A contributor must supply a rights holder, source-bound release evidence, permitted use/distribution scope, retention date, revocability and (for AI creation) specific consent for AI-derived audio. Possession of a recording is not sufficient. Source clips without a legally reviewed, sufficiently covered unit bank may only yield a finite transformed clip; they may not be represented as reusable arbitrary-text voices.

## Revocation and removal

A rights holder can revoke a consent record with a reason and timestamp. `revokeAiConsent()` blocks every future local AI-intent preparation for that source. A production provider adapter must persist the revocation server-side, stop queued jobs, delete/restrict provider outputs where technically and legally possible, and remove affected public links. This frontend deliberately has no provider submission endpoint or AI-created output store, so it has no hidden external output to revoke.

For non-AI variants, a rights/licence withdrawal means the maintainer removes the published WAV and manifest, marks the local candidate rejected/deleted as appropriate, and retains only the minimum provenance/audit record required by law or licence. The protected original remains unchanged in all cases.
