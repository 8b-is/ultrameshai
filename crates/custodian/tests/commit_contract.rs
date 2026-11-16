use custodian::{decision::Decision, Custodian, Event};

#[test]
fn staged_candidates_do_not_change_committed_history() {
    let mut d = Decision::new();
    let initial = d.history_root();
    let id = d.record("speaker", "literal", 7, "source");
    assert_eq!(d.event_count(), 0);
    assert_eq!(d.history_root(), initial);
    assert!(d.admit(&id));
    assert_eq!(d.history_root(), initial);
    assert!(d.commit(&id).is_some());
    assert_eq!(d.event_count(), 1);
    assert!(!d.admit(&id));
    assert!(d.commit(&id).is_none());
}

#[test]
fn event_hashes_preserve_field_boundaries() {
    let first = Event::Observe {
        speaker: "a|b".into(),
        literal: "c".into(),
        timestamp: 1,
        source: "s".into(),
    };
    let second = Event::Observe {
        speaker: "a".into(),
        literal: "b|c".into(),
        timestamp: 1,
        source: "s".into(),
    };
    assert_ne!(first.hash(), second.hash());
}

#[test]
fn stance_and_corrections_are_committed_history() {
    let mut c = Custodian::new();
    let original = c.observe("speaker", "literal", 1, "source");
    let derived = c
        .derive(&original, "interpret", "meaning", "agent")
        .unwrap();
    let initial = c.history_root();
    c.reject(&original, &derived, 2);
    assert_eq!(c.event_count(), 3);
    assert_ne!(c.history_root(), initial);
    let rejected = c.history_root();
    c.accept(&original, &derived);
    assert_eq!(c.event_count(), 4);
    assert_ne!(c.history_root(), rejected);
    c.correct(&derived, &original, "unsupported interpretation");
    assert_eq!(c.event_count(), 5);
    assert!(c.provenance(&derived).is_some());
}

#[test]
fn reject_accept_cycles_and_subjects_remain_distinct() {
    let mut c = Custodian::new();
    let a = c.observe("a", "record", 1, "source");
    let b = c.observe("b", "record", 1, "source");
    let d = c.derive(&a, "interpret", "meaning", "agent").unwrap();
    assert!(c.reject("missing", &d, 2).is_none());
    c.reject(&a, &d, 2);
    c.accept(&b, &d);
    assert!(c.is_tombstoned(&d));
    c.accept(&a, &d);
    assert!(!c.is_tombstoned(&d));
    c.reject(&a, &d, 3);
    assert!(c.is_tombstoned(&d));
    c.accept(&a, &d);
    assert!(!c.is_tombstoned(&d));
}

#[test]
fn derivation_waits_for_committed_parent_and_does_not_self_warrant() {
    let mut d = Decision::new();
    let parent = d.record("a", "record", 1, "source");
    let child = d.stage(Event::Derive {
        parent: parent.clone(),
        transform: "interpret".into(),
        result: "meaning".into(),
        interpreter: "agent".into(),
    });
    assert!(!d.admit(&child));
    assert!(d.admit(&parent));
    d.commit(&parent).unwrap();
    assert!(d.admit(&child));
    d.commit(&child).unwrap();
    use custodian::warrant::WarrantGate;
    let mut gate = WarrantGate::new();
    gate.observe(&parent);
    gate.derive(&child, &parent);
    gate.observe(&child);
    assert_eq!(gate.warrant(&child), WarrantGate::ONE / 2);
    assert!(!gate.check(2, 1, 1, 2));
}
