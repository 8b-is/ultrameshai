//! In-memory provenance prototype. Convenience methods stage, admit and commit
//! through Decision; only Decision::commit mutates committed history.
//! Caller-supplied speaker identities are assertions, not authentication.
//! Durable storage, epoch chaining and authorization are not implemented.

pub mod decision;
pub mod event;
pub mod provenance;
pub mod stance;
pub mod store;
pub mod warrant;

pub use event::{Event, Prov};
pub use provenance::{Node, ProvenanceChain};
pub use store::{CustodianStore, EventId};

/// The provenance of a memory event — the epistemic type.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Provenance {
    /// An actual historical event — Peter said this, at this time.
    Observed,
    /// Mechanically inferred from observed material.
    Inferred,
    /// Generated to explore possibilities.
    Synthetic,
    /// Human/model semantic construction.
    Interpretive,
    /// Counterfactual or experimental.
    Simulated,
}

impl Provenance {
    /// Derived material cannot become observed; identity and ancestry remain separate.
    pub fn downgrade(&self) -> Provenance {
        match self {
            Provenance::Observed => Provenance::Inferred,
            other => *other,
        }
    }
}

/// The Custodian — the gatekeeper that enforces the laws.
#[derive(Debug, Default)]
pub struct Custodian {
    decision: decision::Decision,
}

impl Custodian {
    pub fn new() -> Self {
        Self::default()
    }
    fn append(&mut self, event: Event) -> Option<String> {
        let id = self.decision.stage(event);
        if !self.decision.admit(&id) {
            return None;
        }
        self.decision.commit(&id)?;
        Some(id)
    }
    /// Convenience transaction: record, admit, then commit one observation.
    pub fn observe(&mut self, speaker: &str, literal: &str, t: u64, source: &str) -> String {
        let event = Event::Observe {
            speaker: speaker.into(),
            literal: literal.into(),
            timestamp: t,
            source: source.into(),
        };
        let id = event.hash();
        self.append(event);
        id
    }
    pub fn derive(
        &mut self,
        parent: &str,
        transform: &str,
        result: &str,
        interpreter: &str,
    ) -> Option<String> {
        self.append(Event::Derive {
            parent: parent.into(),
            transform: transform.into(),
            result: result.into(),
            interpreter: interpreter.into(),
        })
    }
    /// Subject and target must name committed nodes. Identity authorization is caller-owned.
    pub fn reject(&mut self, subject: &str, target: &str, t: u64) -> Option<String> {
        self.append(Event::Reject {
            timestamp: t,
            subject: subject.into(),
            target: target.into(),
        })
    }
    pub fn accept(&mut self, subject: &str, target: &str) -> Option<String> {
        self.append(Event::Accept {
            sequence: u64::try_from(self.event_count()).ok()?,
            subject: subject.into(),
            target: target.into(),
        })
    }
    pub fn correct(&mut self, bad: &str, good: &str, reason: &str) -> Option<String> {
        self.append(Event::Correct {
            sequence: u64::try_from(self.event_count()).ok()?,
            bad: bad.into(),
            good: good.into(),
            reason: reason.into(),
        })
    }
    pub fn is_tombstoned(&self, target: &str) -> bool {
        // Acceptance only lifts that subject's rejection, never another subject's.
        let mut rejected = std::collections::HashSet::new();
        for event in self.decision.chain().events() {
            match event {
                Event::Reject {
                    subject,
                    target: found,
                    ..
                } if found == target => {
                    rejected.insert(subject);
                }
                Event::Accept {
                    subject,
                    target: found,
                    ..
                } if found == target => {
                    rejected.remove(subject);
                }
                _ => {}
            }
        }
        !rejected.is_empty()
    }

    /// The provenance of a node.
    pub fn provenance(&self, h: &str) -> Option<Provenance> {
        self.decision.chain().provenance(h)
    }

    /// The lineage of a node — walk back to the observed island.
    pub fn lineage(&self, h: &str) -> Vec<String> {
        self.decision.chain().lineage(h)
    }

    /// The Merkle root of the committed history.
    pub fn history_root(&self) -> String {
        self.decision.chain().history_root()
    }

    pub fn event_count(&self) -> usize {
        self.decision.chain().event_count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn observation_is_observed() {
        let mut c = Custodian::new();
        let o = c.observe("Peter", "feel the light X 101", 1, "session");
        assert_eq!(c.provenance(&o), Some(Provenance::Observed));
    }

    #[test]
    fn derivation_never_inherits_observed() {
        let mut c = Custodian::new();
        let o = c.observe("Peter", "feel the light X 101", 1, "session");
        let i = c
            .derive(&o, "associate-with-light", "101 is light", "system")
            .unwrap();
        assert_eq!(c.provenance(&i), Some(Provenance::Inferred));
    }

    #[test]
    fn rejection_is_immutable_and_tombstoned() {
        let mut c = Custodian::new();
        let o = c.observe("Peter", "telibeszarom a parazst", 2, "session");
        let i = c
            .derive(&o, "ember-metaphor", "the ember waits", "system")
            .unwrap();
        let p = c.observe("Peter", "identity", 0, "session");
        c.reject(&p, &i, 3);
        assert!(c.is_tombstoned(&i));
        assert!(c.provenance(&i).is_some());
    }

    #[test]
    fn accept_supersedes_without_erasing() {
        let mut c = Custodian::new();
        let o = c.observe("Peter", "x", 1, "session");
        let i = c.derive(&o, "t", "y", "system").unwrap();
        let p = c.observe("Peter", "identity", 0, "session");
        c.reject(&p, &i, 2);
        assert!(c.is_tombstoned(&i));
        c.accept(&p, &i);
        assert!(!c.is_tombstoned(&i));
        assert_eq!(c.event_count(), 5); // observations, derivation, rejection, acceptance
    }

    #[test]
    fn lineage_walks_back_to_the_island() {
        let mut c = Custodian::new();
        let o = c.observe("Peter", "feel the light X 101", 1, "session");
        let i1 = c.derive(&o, "light", "101 is light", "system").unwrap();
        let i2 = c
            .derive(&i1, "milarepa", "like Milarepa", "system")
            .unwrap();
        let lineage = c.lineage(&i2);
        assert_eq!(lineage.len(), 3);
        assert_eq!(lineage.last(), Some(&o));
    }

    #[test]
    fn history_root_changes_if_any_event_changes() {
        let mut c = Custodian::new();
        c.observe("Peter", "a", 1, "s");
        let r1 = c.history_root();
        let mut c2 = Custodian::new();
        c2.observe("Peter", "b", 1, "s");
        let r2 = c2.history_root();
        assert_ne!(r1, r2);
    }

    #[test]
    fn transform_does_not_inherit_provenance() {
        let mut c = Custodian::new();
        let o = c.observe("Peter", "limits?", 1, "session");
        let d = c
            .derive(
                &o,
                "paraphrase",
                "Peter said limits were meaningless",
                "system",
            )
            .unwrap();
        assert_eq!(c.provenance(&d), Some(Provenance::Inferred));
        assert_ne!(c.provenance(&d), c.provenance(&o));
    }

    #[test]
    fn decision_commit_is_the_only_mutation_path() {
        use crate::decision::Decision;
        let mut d = Decision::new();
        let id = d.record("Peter", "feel the light X 101", 1, "session");
        assert!(d.admit(&id));
        let root = d.commit(&id);
        assert!(root.is_some());
        assert!(d.commit(&id).is_none());
    }

    #[test]
    fn warrant_gate_enforces_delta_w() {
        use crate::warrant::WarrantGate;
        let mut g = WarrantGate::new();
        let o = "obs1";
        g.observe(o);
        assert_eq!(g.warrant(o), WarrantGate::ONE);
        let d = "der1";
        g.derive(d, o);
        assert_eq!(g.warrant(d), WarrantGate::ONE / 2);
        assert!(g.check(1, 1, 1, 1));
        assert!(!g.check(1, 1, 1, 2));
    }

    #[test]
    fn stance_reject_accept_history() {
        use crate::stance::Stance;
        let mut s = Stance::new();
        s.reject("i1");
        assert!(!s.is_accepted("i1"));
        assert_eq!(s.history("i1"), &["REJECT"]);
        s.accept("i1");
        assert!(s.is_accepted("i1"));
        assert_eq!(s.history("i1"), &["REJECT", "ACCEPT"]);
    }
}

#[cfg(feature = "bench")]
pub mod bench;
