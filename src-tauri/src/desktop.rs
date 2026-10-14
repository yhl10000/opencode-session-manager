use crate::{
    discovery::{BackendState, executable},
    dto::{Catalog, LaunchMode, SessionDetail},
    error::BackendError,
    launcher,
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
    tauri::Builder::default()
        .manage(Arc::new(BackendState::default()))
        .invoke_handler(tauri::generate_handler![
            get_catalog,
            get_session_detail,
            launch_session,
            open_directory
        ])
        .run(tauri::generate_context!())
}
