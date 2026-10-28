use crate::error::{BackendError, Result};
use std::path::{Path, PathBuf};

pub fn explorer_directory(directory: &str) -> Result<PathBuf> {
    if !Path::new(directory).is_dir() {
        return Err(BackendError::MissingDirectory(directory.into()));
    }
    #[cfg(windows)]
    let directory = directory.replace('/', "\\");
    Ok(PathBuf::from(directory))
}
