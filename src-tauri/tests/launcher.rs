use base64::{Engine, engine::general_purpose::STANDARD};
use session_manager::launcher::{LaunchMode, LaunchTarget, terminal_arguments};
use std::path::PathBuf;

#[test]
fn discovered_cli_launches_with_real_help_formats() {
    let temp = tempfile::TempDir::new().unwrap();
    let executable = temp.path().join("opencode.exe");
    let build = std::process::Command::new("rustc")
        .args(["--edition=2024", "tests/fixtures/discovery_cli.rs", "-o"])
        .arg(&executable)
        .output()
        .unwrap();
    assert!(
        build.status.success(),
        "{}",
        String::from_utf8_lossy(&build.stderr)
    );
    for name in ["wt.exe", "pwsh.exe"] {
        std::fs::copy(&executable, temp.path().join(name)).unwrap();
    }
    for (version, help, supported) in [
        (
            "2.2.5",
            "Flags:\n  --session, -s string  Session ID to continue",
            true,
        ),
        ("1.19.0", "Options:\n  -s, --session  session id", true),
        (
            "2.2.5",
            "Flags:\n  --session-id string\n  --sessionless",
            false,
        ),
    ] {
        let database = temp.path().join("sessions.db");
        let _ = std::fs::remove_file(&database);
        let db = rusqlite::Connection::open(&database).unwrap();
        let (schema, table, id) = if version.starts_with('2') {
            (include_str!("schema-v2.sql"), "session_v2", "ses_v2")
        } else {
            (include_str!("schema.sql"), "session", "ses_c")
        };
        db.execute_batch(schema).unwrap();
        db.execute(
            &format!("UPDATE {table} SET directory=?1 WHERE id=?2"),
            rusqlite::params![temp.path().to_string_lossy(), id],
        )
        .unwrap();
        drop(db);
        let receipt = temp.path().join("receipt");
        let _ = std::fs::remove_file(&receipt);
        let output = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "discovered_cli_launch_child", "--nocapture"])
            .env("PATH", temp.path())
            .env("CLI_DB", &database)
            .env("CLI_VERSION", version)
            .env("CLI_HELP", help)
            .env("CLI_SUPPORTED", supported.to_string())
            .env("CLI_ID", id)
            .env("CLI_RECEIPT", &receipt)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "version={version}, help={help}: {}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }
}

#[test]
fn discovered_cli_launch_child() {
    let Some(receipt) = std::env::var_os("CLI_RECEIPT") else {
        return;
    };
    let discovery = session_manager::discovery::discover().unwrap();
    let supported = std::env::var("CLI_SUPPORTED").unwrap() == "true";
    assert_eq!(discovery.supports_session, supported);
    for mode in [LaunchMode::Tab, LaunchMode::Window] {
        let result =
            session_manager::launcher::launch(&discovery, &std::env::var("CLI_ID").unwrap(), mode);
        if !supported {
            assert!(matches!(
                result,
                Err(session_manager::error::BackendError::Discovery(_))
            ));
            assert!(!std::path::Path::new(&receipt).exists());
            continue;
        }
        assert!(result.unwrap().contains("Dispatched Windows Terminal"));
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while !std::path::Path::new(&receipt).exists() {
            assert!(
                std::time::Instant::now() < deadline,
                "fake terminal did not dispatch"
            );
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        let arguments = std::fs::read_to_string(&receipt).unwrap();
        assert!(arguments.starts_with(match mode {
            LaunchMode::Tab => "-w\n0\nnew-tab\n",
            LaunchMode::Window => "-w\nnew\nnew-tab\n",
        }));
        std::fs::remove_file(&receipt).unwrap();
    }
}

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
        .as_chunks::<2>()
        .0
        .iter()
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
    let receipt_directory = PathBuf::from(receipt["directory"].as_str().unwrap());
    assert_eq!(
        std::fs::canonicalize(&receipt_directory).unwrap(),
        std::fs::canonicalize(&directory).unwrap()
    );
    assert_eq!(
        receipt_directory.file_name().unwrap(),
        "Unicode 中 O'Brien; Write-Error injected"
    );
    assert!(output.stderr.is_empty());
}
