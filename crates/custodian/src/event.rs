//! Event types — the immutable history log.
//! OBSERVE / DERIVE / REJECT / ACCEPT / CORRECT.
//! Each event is hashed with BLAKE3; the hash is its identity.

use crate::Provenance;

/// A historical event — the only thing that is hashed and committed.
#[derive(Debug, Clone)]
pub enum Event {
    Observe {
        speaker: String,
        literal: String,
        timestamp: u64,
        source: String,
    },
    Derive {
        parent: String,
        transform: String,
        result: String,
        interpreter: String,
    },
    Reject {
        timestamp: u64,
        subject: String,
        target: String,
    },
    Accept {
        sequence: u64,
        subject: String,
        target: String,
    },
    Correct {
        sequence: u64,
        bad: String,
        good: String,
        reason: String,
    },
}

impl Event {
    /// Canonical serialization for hashing.
    pub fn canonical(&self) -> Vec<u8> {
        // Versioned, length-delimited UTF-8 fields prevent separator collisions.
        let mut out = b"custodian-event-v1\0".to_vec();
        let mut field = |value: &str| {
            out.extend_from_slice(
                &u64::try_from(value.len())
                    .expect("field length")
                    .to_le_bytes(),
            );
            out.extend_from_slice(value.as_bytes());
        };
        match self {
            Event::Observe {
                speaker,
                literal,
                timestamp,
                source,
            } => {
                field("OBSERVE");
                field(speaker);
                field(literal);
                field(&timestamp.to_string());
                field(source);
            }
            Event::Derive {
                parent,
                transform,
                result,
                interpreter,
            } => {
                field("DERIVE");
                field(parent);
                field(transform);
                field(result);
                field(interpreter);
            }
            Event::Reject {
                subject,
                target,
                timestamp,
            } => {
                field(&timestamp.to_string());
                field("REJECT");
                field(subject);
                field(target);
            }
            Event::Accept {
                subject,
                target,
                sequence,
            } => {
                field(&sequence.to_string());
                field("ACCEPT");
                field(subject);
                field(target);
            }
            Event::Correct {
                bad,
                good,
                reason,
                sequence,
            } => {
                field(&sequence.to_string());
                field("CORRECT");
                field(bad);
                field(good);
                field(reason);
            }
        }
        out
    }

    /// The BLAKE3 content hash as a hex string.
    pub fn hash(&self) -> String {
        blake3::hash(&self.canonical()).to_hex().to_string()
    }
}

/// The provenance of an event — the epistemic type.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Prov {
    Observed,
    Inferred,
    Synthetic,
    Interpretive,
    Simulated,
}

impl From<Prov> for Provenance {
    fn from(p: Prov) -> Self {
        match p {
            Prov::Observed => Provenance::Observed,
            Prov::Inferred => Provenance::Inferred,
            Prov::Synthetic => Provenance::Synthetic,
            Prov::Interpretive => Provenance::Interpretive,
            Prov::Simulated => Provenance::Simulated,
        }
    }
}
