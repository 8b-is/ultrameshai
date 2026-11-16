//! Staging is separate from committed history. Only commit mutates the chain.
use crate::{event::Event, provenance::ProvenanceChain};
use std::collections::{HashMap, HashSet};
#[derive(Debug, Default)]
pub struct Decision {
    chain: ProvenanceChain,
    staged: HashMap<String, Event>,
    admitted: HashSet<String>,
    committed: HashSet<String>,
}
impl Decision {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn record(&mut self, speaker: &str, literal: &str, t: u64, source: &str) -> String {
        self.stage(Event::Observe {
            speaker: speaker.into(),
            literal: literal.into(),
            timestamp: t,
            source: source.into(),
        })
    }
    pub fn stage(&mut self, event: Event) -> String {
        let id = event.hash();
        if !self.committed.contains(&id) {
            self.staged.entry(id.clone()).or_insert(event);
        }
        id
    }
    pub fn admit(&mut self, id: &str) -> bool {
        if self
            .staged
            .get(id)
            .is_some_and(|event| self.chain.valid(event))
        {
            self.admitted.insert(id.into());
            true
        } else {
            false
        }
    }
    pub fn commit(&mut self, id: &str) -> Option<String> {
        if !self.admitted.contains(id) {
            return None;
        }
        let event = self.staged.get(id)?.clone();
        self.chain.apply(event)?;
        self.admitted.remove(id);
        self.staged.remove(id);
        self.committed.insert(id.into());
        Some(self.chain.history_root())
    }
    pub fn chain(&self) -> &ProvenanceChain {
        &self.chain
    }
    pub fn history_root(&self) -> String {
        self.chain.history_root()
    }
    pub fn event_count(&self) -> usize {
        self.chain.event_count()
    }
}
