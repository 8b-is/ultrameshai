//! In-memory insertion and warrant microbenchmarks. Elapsed values are nanoseconds.
//! No phase geometry, routing or compaction performance is measured here.
use crate::{warrant::WarrantGate, Custodian};
use std::{hint::black_box, time::Instant};
pub fn bench_insertion(n: usize) -> (usize, u128) {
    let mut c = Custodian::new();
    let start = Instant::now();
    for i in 0..n {
        black_box(c.observe(
            "benchmark",
            &format!("observation {i}"),
            u64::try_from(i).expect("timestamp"),
            "bench",
        ));
    }
    (n, start.elapsed().as_nanos())
}
pub fn bench_warrant_gate(n: usize) -> (usize, u128) {
    let gate = WarrantGate::new();
    let start = Instant::now();
    for _ in 0..n {
        black_box(gate.check(black_box(1), 1, 1, 1));
    }
    (n, start.elapsed().as_nanos())
}
