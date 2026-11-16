//! Provenance — in-memory ancestry and a Merkle root over committed events.
//! The laws: derived meaning never inherits observed provenance;
//! Each derivation has its own event identity and explicit parent.

use crate::event::Event;
use std::collections::HashMap;

/// A memory node — a materialized view of an event.
#[derive(Debug, Clone)]
pub struct Node {
    pub id: String,
    pub provenance: crate::Provenance,
    pub parents: Vec<String>,
    pub content: String,
    pub agent: String,
}

/// The provenance verifier — walks lineage, checks the laws.
#[derive(Debug, Default)]
pub struct ProvenanceChain {
    nodes: HashMap<String, Node>,
    log: Vec<Event>,
}

impl ProvenanceChain {
    pub fn new() -> Self {
        Self {
            nodes: HashMap::new(),
            log: Vec::new(),
        }
    }

    pub(crate) fn valid(&self, event: &Event) -> bool {
        match event {
            Event::Observe { .. } => true,
            Event::Derive { parent, .. } => self.nodes.contains_key(parent),
            Event::Reject {
                subject, target, ..
            }
            | Event::Accept {
                subject, target, ..
            } => self.nodes.contains_key(subject) && self.nodes.contains_key(target),
            Event::Correct { bad, good, .. } => {
                self.nodes.contains_key(bad) && self.nodes.contains_key(good)
            }
        }
    }

    // Only Decision::commit calls this mutation boundary.
    pub(crate) fn apply(&mut self, event: Event) -> Option<String> {
        if !self.valid(&event) {
            return None;
        }
        let id = event.hash();
        match &event {
            Event::Observe {
                speaker, literal, ..
            } => {
                self.nodes.insert(
                    id.clone(),
                    Node {
                        id: id.clone(),
                        provenance: crate::Provenance::Observed,
                        parents: vec![],
                        content: literal.clone(),
                        agent: speaker.clone(),
                    },
                );
            }
            Event::Derive {
                parent,
                result,
                interpreter,
                ..
            } => {
                let provenance = self.nodes.get(parent)?.provenance.downgrade();
                self.nodes.insert(
                    id.clone(),
                    Node {
                        id: id.clone(),
                        provenance,
                        parents: vec![parent.clone()],
                        content: result.clone(),
                        agent: interpreter.clone(),
                    },
                );
            }
            _ => {}
        }
        self.log.push(event);
        Some(id)
    }

    pub fn events(&self) -> &[Event] {
        &self.log
    }

    pub fn provenance(&self, h: &str) -> Option<crate::Provenance> {
        self.nodes.get(h).map(|n| n.provenance)
    }

    /// Walk the lineage back to the observed island.
    pub fn lineage(&self, h: &str) -> Vec<String> {
        let mut path = vec![];
        let mut cur = h.to_string();
        while let Some(node) = self.nodes.get(&cur) {
            path.push(cur.clone());
            match node.parents.first() {
                Some(p) => cur = p.clone(),
                None => break,
            }
        }
        path
    }

    /// Merkle root of the committed history.
    pub fn history_root(&self) -> String {
        if self.log.is_empty() {
            return blake3::hash(b"empty").to_hex().to_string();
        }
        let mut level: Vec<String> = self.log.iter().map(|e| e.hash()).collect();
        while level.len() > 1 {
            let mut next = Vec::with_capacity(level.len() / 2 + 1);
            for chunk in level.chunks(2) {
                let mut hasher = blake3::Hasher::new();
                hasher.update(chunk[0].as_bytes());
                if let Some(second) = chunk.get(1) {
                    hasher.update(second.as_bytes());
                }
                next.push(hasher.finalize().to_hex().to_string());
            }
            level = next;
        }
        level[0].clone()
    }

    pub fn event_count(&self) -> usize {
        self.log.len()
    }
}
