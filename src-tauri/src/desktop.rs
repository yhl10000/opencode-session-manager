use crate::{
    discovery::{BackendState, executable},
    dto::{Catalog, DeleteResult, LaunchMode, SessionDetail},
    error::BackendError,
    launcher,
    mutation::ExitDecision,
};
use std::{path::Path, process::Command, sync::Arc};
use tauri::State;

async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> crate::error::Result<T> + Send + 'static,
) -> std::result::Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_catalog(state: State<'_, Arc<BackendState>>) -> std::result::Result<Catalog, String> {
    let state = Arc::clone(state.inner());
    blocking(move || state.discovery()?.repository.catalog()).await
}

#[tauri::command]
async fn get_session_detail(
    session_id: String,
    state: State<'_, Arc<BackendState>>,
) -> std::result::Result<SessionDetail, String> {
    let state = Arc::clone(state.inner());
    blocking(move || state.discovery()?.repository.detail(&session_id)).await
}

#[tauri::command]
async fn launch_session(
    session_id: String,
    mode: LaunchMode,
    state: State<'_, Arc<BackendState>>,
) -> std::result::Result<String, String> {
    let state = Arc::clone(state.inner());
    blocking(move || {
        let discovery = state.discovery()?;
        launcher::launch(&discovery, &session_id, mode)
    })
    .await
}

#[tauri::command]
async fn open_directory(
    session_id: String,
    state: State<'_, Arc<BackendState>>,
) -> std::result::Result<(), String> {
    let state = Arc::clone(state.inner());
    blocking(move || {
        let session = state.discovery()?.repository.session(&session_id)?;
        if !Path::new(&session.directory).is_dir() {
            return Err(BackendError::MissingDirectory(session.directory));
        }
        Command::new(executable("explorer")?)
            .arg(session.directory)
            .spawn()?;
        Ok(())
    })
    .await
}

pub fn run() -> std::result::Result<(), tauri::Error> {
    let state = Arc::new(BackendState::default());
    let app = tauri::Builder::default()
        .manage(Arc::clone(&state))
        .invoke_handler(tauri::generate_handler![
            get_catalog,
            get_session_detail,
            launch_session,
            open_directory,
            delete_sessions,
            rename_session
        ])
        .build(tauri::generate_context!())?;
    app.run(move |handle, event| {
        if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
            match state.mutations.request_shutdown() {
                Ok(ExitDecision::Exit) => {}
                Ok(ExitDecision::Wait) => api.prevent_exit(),
                Ok(ExitDecision::Drain) => {
                    api.prevent_exit();
                    let state = Arc::clone(&state);
                    let handle = handle.clone();
                    tauri::async_runtime::spawn_blocking(move || {
                        match state.mutations.wait_drained() {
                            Ok(()) => handle.exit(code.unwrap_or(0)),
                            Err(error) => eprintln!("Cannot finish application shutdown: {error}"),
                        }
                    });
                }
                Err(error) => {
                    api.prevent_exit();
                    eprintln!("Cannot begin application shutdown: {error}");
                }
            }
        }
    });
    Ok(())
}

#[tauri::command]
async fn delete_sessions(
    session_ids: Vec<String>,
    state: State<'_, Arc<BackendState>>,
) -> std::result::Result<DeleteResult, String> {
    let state = Arc::clone(state.inner());
    blocking(move || {
        state.mutations.execute(|| {
            let discovery = state.discovery()?;
            crate::deletion::delete(&discovery, &session_ids)
        })
    })
    .await
}

#[tauri::command]
async fn rename_session(
    session_id: String,
    title: String,
    state: State<'_, Arc<BackendState>>,
) -> std::result::Result<Catalog, String> {
    let state = Arc::clone(state.inner());
    blocking(move || {
        state.mutations.execute(|| {
            let discovery = state.discovery()?;
            crate::rename::rename(&discovery, &session_id, &title)
        })
    })
    .await
}
