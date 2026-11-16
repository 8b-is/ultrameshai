# CUSTODIAN — Epistemic Specification

## Ontological Triad
- **Flame** — the observed, the literal, the event. `OBSERVED`.
- **Ember** — the derived, the interpretation. `INFERRED`/`DERIVED`.
- **Ash** — the rejected, the corrected, the forgotten-but-preserved.

## The 5-Tuple Contract
Every memory event is `(speaker, literal content, timestamp, source, provenance)`.

## Law of Non-Self-Warranting Memory
ΔW = 0 implies ΔA ≤ 0. Persistence is not warrant; repetition is not evidence.

## Tripartite Separation
Record ≠ Admit ≠ Commit. `commit()` is the ONLY public path that mutates epistemic state.

## Substrate Ancestry Axioms
- Growth must not falsify ancestry.
- Rule I: A target state may not overwrite its historical substrate.
- Rule II: Derived memories may not masquerade as independent observations.
- Rule III: Completion pressure may not become its own warrant for continuation.

## Epistemic Type Safety
- Quotation is observation. Interpretation is derivation.
- Derived meaning never inherits observed provenance.
- transform(x) != x  =>  prov(transform(x)) != prov(x)

## First-Class Rejection Edges
- `P --REJECTS--> I` — immutable, tombstoned (BLAKE3 hash).
- `P --ACCEPTS--> I` — supersedes without erasing.
- 3-tier lifecycle: salience decay, historical persistence, contextual scoping.

## The 4-Action Ineffability State Machine
`[stay] [fragments] [find words] [later]` — UNARTICULATED ⇏ INFER.

## The Janitorial Equilibrium
Fivefold janitorial model — maintenance convergence, Markov blanket boundary.

## Continuation Geometry
Reachability, Viability, Recoverability, Path-Dependence.

## The Universal Invariant
**The subject must be able to challenge an interpretation without challenging the historical record.**

## Prototype implementation boundary

The Rust crate is an in-memory event/ancestry prototype, not an authenticated or
persistent identity service. `Decision::record`/`stage` and `admit` leave committed
history unchanged; only `Decision::commit` appends it. `Custodian` convenience
methods execute that transaction. Duplicate event identities commit at most once.
Canonical v1 hashes use length-delimited fields, incompatible with the initial
ambiguous delimiter format. No migration of deployed state is claimed.

Rejections retain the supplied timestamp. Accept/correct events include a logical
committed-event ordinal; this is not a wall-clock timestamp. Derived events retain
their parent and interpreter but do not yet carry the specification's full
five-tuple. Observed labels describe caller assertions, not verified observations.
Stance is tracked per subject; accepting cannot cancel another subject's rejection.
The warrant helper uses Q32 integers and halving rounded down; it is an illustrative
policy, not measured confidence or an integrated authorization mechanism.

Durable store/replay, authenticated subjects, full event metadata, epoch chaining,
capacity limits, geometry, janitor compaction and the complete epistemic admission
policy remain open. The `bench` feature measures insertion/warrant checks only;
it does not establish phase-space or compaction performance.
