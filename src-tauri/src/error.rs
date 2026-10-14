#[derive(Debug, thiserror::Error)]
pub enum BackendError {
    #[error("Cannot read OpenCode database (unsupported schema or unavailable file): {0}")]
    Database(#[from] rusqlite::Error),
    #[error("Cannot execute native command: {0}")]
    Io(#[from] std::io::Error),
    #[error("Required executable not found: {0}")]
    Executable(String),
    #[error(
        "Unsupported PowerShell executable path containing ';': {0}. Install PowerShell in a path without semicolons and update PATH before retrying."
    )]
    UnsupportedExecutablePath(std::path::PathBuf),
    #[error("OpenCode discovery failed: {0}")]
    Discovery(String),
    #[error("Session is not present in the OpenCode database: {0}")]
    MissingSession(String),
    #[error("Invalid session ID: {0}")]
    InvalidSession(String),
    #[error("Session directory does not exist: {0}")]
    MissingDirectory(String),
}

pub type Result<T> = std::result::Result<T, BackendError>;
