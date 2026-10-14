use base64::{Engine, engine::general_purpose::STANDARD};
use session_manager::launcher::{LaunchMode, LaunchTarget, terminal_arguments};
use std::path::PathBuf;

#[test]
fn encoded_script_keeps_unicode_and_metacharacters_literal() {
    let target = LaunchTarget {
        directory: "Q:\\Unicode 中\\O'Brien;next".into(),
        session_id: "ses_safe".into(),
        opencode: PathBuf::from("C:\\O'Brien;tools\\opencode.exe"),
        powershell: PathBuf::from("C:\\Program Files\\pwsh.exe"),
    };

    let args = terminal_arguments(&target, LaunchMode::Tab).unwrap();

    assert_eq!(
        &args[..4],
        ["-w", "0", "new-tab", "C:\\Program Files\\pwsh.exe"]
    );
    assert!(!args.iter().any(|argument| argument == &target.directory));
    assert!(args.iter().all(|argument| !argument.contains(';')));
    let bytes = STANDARD.decode(args.last().unwrap()).unwrap();
    let units = bytes
        .chunks_exact(2)
        .map(|b| u16::from_le_bytes([b[0], b[1]]))
        .collect::<Vec<_>>();
    let script = String::from_utf16(&units).unwrap();
    assert!(script.contains("'Q:\\Unicode 中\\O''Brien;next'"));
    assert!(script.contains("& 'C:\\O''Brien;tools\\opencode.exe' --session 'ses_safe'"));
    assert!(!script.contains("--pure"));
}

#[test]
fn semicolon_in_powershell_executable_is_rejected_before_terminal_dispatch() {
    let target = LaunchTarget {
        directory: "Q:\\work;literal".into(),
        session_id: "ses_safe".into(),
        opencode: PathBuf::from("C:\\OpenCode\\opencode.exe"),
        powershell: PathBuf::from("C:\\Power;Shell\\pwsh.exe"),
    };

    let result = terminal_arguments(&target, LaunchMode::Tab);

    assert!(
        matches!(result, Err(session_manager::error::BackendError::UnsupportedExecutablePath(path)) if path == target.powershell)
    );
}

#[test]
fn window_mode_targets_new_window() {
    let target = LaunchTarget {
        directory: "Q:\\work".into(),
        session_id: "ses_safe".into(),
        opencode: PathBuf::from("C:\\opencode.exe"),
        powershell: PathBuf::from("C:\\pwsh.exe"),
    };

    let args = terminal_arguments(&target, LaunchMode::Window).unwrap();

    assert_eq!(args[1], "new");
}

#[test]
fn unsafe_session_id_is_rejected() {
    let target = LaunchTarget {
        directory: "Q:\\work".into(),
        session_id: "ses_x';evil".into(),
        opencode: PathBuf::from("C:\\opencode.exe"),
        powershell: PathBuf::from("C:\\pwsh.exe"),
    };

    let result = terminal_arguments(&target, LaunchMode::Tab);

    assert!(result.is_err());
}

#[test]
fn powershell_executes_paths_as_literals_without_injected_commands() {
    let temp = tempfile::TempDir::new().unwrap();
    let directory = temp.path().join("Unicode 中 O'Brien; Write-Error injected");
    std::fs::create_dir(&directory).unwrap();
    let program = temp.path().join("O'Brien;receipt.ps1");
    std::fs::write(
        &program,
        "[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); @{arguments=@($args);directory=(Get-Location).Path} | ConvertTo-Json -Compress; $global:LASTEXITCODE = 0",
    )
    .unwrap();
    let powershell = session_manager::discovery::executable("pwsh").unwrap();
    let target = LaunchTarget {
        directory: directory.to_string_lossy().into_owned(),
        session_id: "ses_safe".into(),
        opencode: program,
        powershell: powershell.clone(),
    };
    let args = terminal_arguments(&target, LaunchMode::Tab).unwrap();

    let output = std::process::Command::new(powershell)
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-EncodedCommand",
            args.last().unwrap(),
        ])
        .output()
        .unwrap();

    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let receipt: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(
        receipt["arguments"],
        serde_json::json!(["--session", "ses_safe"])
    );
    assert_eq!(receipt["directory"], target.directory);
    assert!(output.stderr.is_empty());
}
