//! Illustrative warrant policy, not a measured confidence estimator.
//! Q32 fixed point: ONE=2^32; derivation divides by two, rounding down to zero.
#[derive(Default)]
pub struct WarrantGate {
    warrant: std::collections::HashMap<String, u64>,
}
impl WarrantGate {
    pub const ONE: u64 = 1 << 32;
    pub fn new() -> Self {
        Self::default()
    }
    /// Repeated claims cannot promote an existing derived node.
    pub fn observe(&mut self, h: &str) {
        self.warrant.entry(h.into()).or_insert(Self::ONE);
    }
    pub fn derive(&mut self, h: &str, parent: &str) {
        let value = self.warrant(parent) / 2;
        self.warrant.entry(h.into()).or_insert(value);
    }
    pub fn warrant(&self, h: &str) -> u64 {
        self.warrant.get(h).copied().unwrap_or(0)
    }
    /// Authority can increase only when warrant increases. Units must match per pair.
    pub fn check(&self, before_w: u64, after_w: u64, before_a: u64, after_a: u64) -> bool {
        after_w > before_w || after_a <= before_a
    }
}
