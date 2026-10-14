use crate::{
    error::{BackendError, Result},
    repository::Repository,
};
use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Arc, OnceLock},
    time::Duration,
};
use wait_timeout::ChildExt;

#[derive(Debug)]
pub struct Discovery {
    pub repository: Repository,
    pub opencode: PathBuf,
    pub supports_session: bool,
}

#[derive(Debug, Default)]
pub struct BackendState {
    discovery: OnceLock<std::result::Result<Arc<Discovery>, String>>,
    pub mutations: crate::mutation::MutationLifecycle,
}

impl BackendState {
    pub fn discovery(&self) -> Result<Arc<Discovery>> {
        match self
            .discovery
            .get_or_init(|| discover().map(Arc::new).map_err(|e| e.to_string()))
        {
            Ok(discovery) => Ok(Arc::clone(discovery)),
            Err(error) => Err(BackendError::Discovery(error.clone())),
        }
    }
}

pub fn executable(name: &str) -> Result<PathBuf> {
    let path = which::which(name).map_err(|_| BackendError::Executable(name.into()))?;
    if !path.is_absolute() || !path.is_file() {
        return Err(BackendError::Executable(name.into()));
    }
    Ok(path)
}

pub(crate) fn metadata_output(program: &Path, args: &[&str]) -> Result<String> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let mut child = command.spawn()?;
    if child.wait_timeout(Duration::from_secs(15))?.is_none() {
        child.kill()?;
        child.wait()?;
        return Err(BackendError::Discovery(format!(
            "OpenCode {} timed out after 15 seconds",
            args.join(" ")
        )));
    }
    let output = child.wait_with_output()?;
    if !output.status.success() {
        return Err(BackendError::Discovery(
            String::from_utf8_lossy(&output.stderr).trim().into(),
        ));
    }
    let text = if output.stdout.is_empty() {
        output.stderr
    } else {
        output.stdout
    };
    String::from_utf8(text)
        .map(|s| s.trim().to_owned())
        .map_err(|error| BackendError::Discovery(error.to_string()))
}

pub fn discover() -> Result<Discovery> {
    let opencode = executable("opencode")?;
    let version = metadata_output(&opencode, &["--version"])?;
    let help = metadata_output(&opencode, &["--help"])?;
    let supports_session = help.split_whitespace().any(|word| word == "--session");
    let path = PathBuf::from(metadata_output(&opencode, &["db", "path"])?);
    if !path.is_absolute() || !path.is_file() {
        return Err(BackendError::Discovery(format!(
            "OpenCode returned an unavailable database path: {}",
            path.display()
        )));
    }
    Ok(Discovery {
        repository: Repository::new(path, version),
        opencode,
        supports_session,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metadata_reads_successful_help_from_stderr() {
        let powershell = executable("pwsh").unwrap();

        let text = metadata_output(
            &powershell,
            &[
                "-NoProfile",
                "-Command",
                "[Console]::Error.Write('--session')",
            ],
        )
        .unwrap();

        assert_eq!(text, "--session");
    }

    #[test]
    fn metadata_keeps_stdout_separate_from_warnings() {
        let powershell = executable("pwsh").unwrap();

        let text = metadata_output(
            &powershell,
            &[
                "-NoProfile",
                "-Command",
                "[Console]::Out.Write('1.19.0'); [Console]::Error.Write('warning')",
            ],
        )
        .unwrap();

        assert_eq!(text, "1.19.0");
    }
}
