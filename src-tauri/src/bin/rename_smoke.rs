use session_manager::{
    discovery,
    mutation::{ExitDecision, MutationLifecycle},
    rename,
};
use std::{
    path::PathBuf,
    sync::{Arc, mpsc},
    thread,
};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(std::env::var("RENAME_SMOKE_ROOT")?).canonicalize()?;
    for key in [
        "HOME",
        "USERPROFILE",
        "XDG_DATA_HOME",
        "XDG_CONFIG_HOME",
        "XDG_CACHE_HOME",
        "XDG_STATE_HOME",
    ] {
        if !PathBuf::from(std::env::var(key)?)
            .canonicalize()?
            .starts_with(&root)
        {
            return Err("Smoke environment is not isolated".into());
        }
    }
    let discovery = discovery::discover()?;
    if !discovery
        .repository
        .database_path()
        .canonicalize()?
        .starts_with(&root)
    {
        return Err("Refusing to mutate a database outside the smoke sandbox".into());
    }
    let id = std::env::args()
        .nth(1)
        .ok_or("Missing synthetic session ID")?;
    println!(
        "Synthetic repository session: {}",
        serde_json::to_string(&discovery.repository.session(&id)?)?
    );
    let mutations = Arc::new(MutationLifecycle::default());
    let worker_mutations = Arc::clone(&mutations);
    let (started, active) = mpsc::channel();
    let (release, resume) = mpsc::channel();
    let worker_id = id.clone();
    let worker = thread::spawn(move || {
        worker_mutations.execute(|| {
            started
                .send(())
                .map_err(|_| session_manager::error::BackendError::MutationUnavailable)?;
            resume
                .recv()
                .map_err(|_| session_manager::error::BackendError::MutationUnavailable)?;
            rename::rename(
                &discovery,
                &worker_id,
                "  Backend renamed 中文 \"quotes\"  ",
            )
        })
    });
    active.recv()?;
    if mutations.request_shutdown()? != ExitDecision::Drain {
        return Err("Shutdown did not defer active synthetic rename".into());
    }
    if mutations.execute(|| Ok(())).is_ok() {
        return Err("Shutdown accepted a new mutation".into());
    }
    release.send(())?;
    mutations.wait_drained()?;
    let catalog = worker.join().map_err(|_| "Rename worker panicked")??;
    if mutations.request_shutdown()? != ExitDecision::Exit {
        return Err("Shutdown did not become ready after rename cleanup".into());
    }
    let session = catalog
        .sessions
        .iter()
        .find(|session| session.id == id)
        .ok_or("Missing renamed session")?;
    if session.title != "Backend renamed 中文 \"quotes\"" {
        return Err("Backend catalog did not contain trimmed title".into());
    }
    if rename::rename(&discovery::discover()?, &id, "  ").is_ok() {
        return Err("Backend accepted an empty title".into());
    }
    println!(
        "Isolated active rename drained before exit; later mutations rejected; Catalog persisted trimmed title; empty title rejected"
    );
    Ok(())
}
