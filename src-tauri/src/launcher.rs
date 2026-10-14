use crate::discovery::{Discovery, executable};
pub use crate::dto::LaunchMode;
use crate::error::{BackendError, Result};
use base64::{Engine, engine::general_purpose::STANDARD};
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug)]
pub struct LaunchTarget {
    pub directory: String,
    pub session_id: String,
    pub opencode: PathBuf,
    pub powershell: PathBuf,
}

pub fn validate_session_id(id: &str) -> Result<()> {
    if !id.starts_with("ses_")
        || id.len() > 200
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
    {
        return Err(BackendError::InvalidSession(id.into()));
    }
    Ok(())
}

fn quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

pub fn terminal_arguments(target: &LaunchTarget, mode: LaunchMode) -> Result<Vec<String>> {
    validate_session_id(&target.session_id)?;
    if target
        .powershell
        .as_os_str()
        .to_string_lossy()
        .contains(';')
    {
        return Err(BackendError::UnsupportedExecutablePath(
            target.powershell.clone(),
        ));
    }
    let script = format!(
        "$ErrorActionPreference = 'Stop'; try {{ Set-Location -LiteralPath {}; & {} --session {}; if ($LASTEXITCODE -ne 0) {{ Write-Host ('OpenCode exited with code ' + $LASTEXITCODE + '. Check the session ID and directory, then retry.') -ForegroundColor Red }} }} catch {{ Write-Host ('Unable to open OpenCode session: ' + $_.Exception.Message + '. Check that OpenCode is installed and this directory is accessible.') -ForegroundColor Red }}",
        quote(&target.directory),
        quote(&target.opencode.to_string_lossy()),
        quote(&target.session_id)
    );
    let bytes: Vec<u8> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
    let window = match mode {
        LaunchMode::Tab => "0",
        LaunchMode::Window => "new",
    };
    Ok(vec![
        "-w".into(),
        window.into(),
        "new-tab".into(),
        target.powershell.to_string_lossy().into_owned(),
        "-NoLogo".into(),
        "-NoExit".into(),
        "-EncodedCommand".into(),
        STANDARD.encode(bytes),
    ])
}

pub fn launch(discovery: &Discovery, id: &str, mode: LaunchMode) -> Result<String> {
    validate_session_id(id)?;
    let session = discovery.repository.session(id)?;
    if !std::path::Path::new(&session.directory).is_dir() {
        return Err(BackendError::MissingDirectory(session.directory));
    }
    if !discovery.supports_session {
        return Err(BackendError::Discovery(
            "Installed OpenCode does not advertise --session".into(),
        ));
    }
    if !discovery.opencode.is_file() {
        return Err(BackendError::Executable(
            discovery.opencode.display().to_string(),
        ));
    }
    let target = LaunchTarget {
        directory: session.directory,
        session_id: id.into(),
        opencode: discovery.opencode.clone(),
        powershell: executable("pwsh")?,
    };
    let arguments = terminal_arguments(&target, mode)?;
    let child = Command::new(executable("wt")?).args(arguments).spawn()?;
    Ok(format!(
        "Dispatched Windows Terminal launch request for {id} (dispatcher PID {}). Session loading and TUI readiness are not confirmed.",
        child.id()
    ))
}
