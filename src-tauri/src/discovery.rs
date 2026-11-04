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

pub(crate) fn is_v2(version: &str) -> bool {
    let version = version
        .trim()
        .strip_prefix("opencode ")
        .unwrap_or(version.trim());
    let major = version
        .trim_start_matches('v')
        .split('.')
        .next()
        .and_then(|major| major.parse::<u32>().ok());
    major.is_some_and(|major| major >= 2)
}

pub(crate) fn database_path_args(version: &str) -> &'static [&'static str] {
    if is_v2(version) {
        &["debug", "paths", "db"]
    } else {
        &["db", "path"]
    }
}

pub fn discover() -> Result<Discovery> {
    let opencode = executable("opencode")?;
    let version = metadata_output(&opencode, &["--version"])?;
    let help = metadata_output(&opencode, &["--help"])?;
    let supports_session = help
        .split_whitespace()
        .any(|word| word.trim_end_matches(',') == "--session");
    let path = PathBuf::from(metadata_output(&opencode, database_path_args(&version))?);
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
    fn database_path_args_preserves_v1_command() {
        assert_eq!(database_path_args("1.19.0"), &["db", "path"]);
    }

    #[test]
    fn database_path_args_uses_v2_debug_paths_without_pure() {
        for version in ["opencode v2.2.5", "2.2.5", "v2.2.5"] {
            assert_eq!(database_path_args(version), &["debug", "paths", "db"]);
        }
    }

    #[test]
    fn major_version_detection_preserves_v1_and_unknown_versions() {
        for version in ["1.19.0", "opencode v1.19.0", "", "unknown", "version 2.2.5"] {
            assert!(!is_v2(version), "{version}");
        }
        for version in ["2.2.5", "opencode v2.2.5", " v2.2.5 ", "3.0.0"] {
            assert!(is_v2(version), "{version}");
        }
    }

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
