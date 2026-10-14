use super::*;
use std::sync::{Arc, mpsc};
use std::thread;

#[test]
fn shutdown_rejects_new_mutations_even_when_idle() {
    let lifecycle = MutationLifecycle::default();

    assert_eq!(lifecycle.request_shutdown().unwrap(), ExitDecision::Exit);

    assert!(lifecycle.execute(|| Ok(())).is_err());
}

#[test]
fn shutdown_waits_for_active_cleanup_and_rejects_queued_mutations() {
    let lifecycle = Arc::new(MutationLifecycle::default());
    let (started, active) = mpsc::channel();
    let (release, resume) = mpsc::channel();
    let (cleaned, cleanup) = mpsc::channel();
    let worker_state = Arc::clone(&lifecycle);
    let worker = thread::spawn(move || {
        worker_state.execute(|| {
            started.send(()).unwrap();
            resume.recv().unwrap();
            cleaned.send(()).unwrap();
            Ok(())
        })
    });
    active.recv().unwrap();
    let queued_state = Arc::clone(&lifecycle);
    let (submitted, pending) = mpsc::channel();
    let queued = thread::spawn(move || {
        submitted.send(()).unwrap();
        queued_state.execute::<()>(|| panic!("queued mutation must never start"))
    });
    pending.recv().unwrap();

    let decision = lifecycle.request_shutdown().unwrap();

    assert_eq!(decision, ExitDecision::Drain);
    assert_eq!(lifecycle.request_shutdown().unwrap(), ExitDecision::Wait);
    assert!(lifecycle.execute(|| Ok(())).is_err());
    assert!(queued.join().unwrap().is_err());
    let draining_state = Arc::clone(&lifecycle);
    let drain = thread::spawn(move || {
        draining_state.wait_drained().unwrap();
        cleanup.try_recv().unwrap();
        assert_eq!(
            draining_state.request_shutdown().unwrap(),
            ExitDecision::Exit
        );
    });
    release.send(()).unwrap();
    worker.join().unwrap().unwrap();
    drain.join().unwrap();
}

#[test]
fn mutation_failure_releases_shutdown_waiter() {
    let lifecycle = MutationLifecycle::default();

    let result: Result<()> = lifecycle.execute(|| {
        assert_eq!(lifecycle.request_shutdown().unwrap(), ExitDecision::Drain);
        Err(crate::error::BackendError::Rename(
            "synthetic failure".into(),
        ))
    });

    assert!(result.is_err());
    lifecycle.wait_drained().unwrap();
    assert_eq!(lifecycle.request_shutdown().unwrap(), ExitDecision::Exit);
}
