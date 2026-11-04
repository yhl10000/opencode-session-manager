use session_manager::{discovery::Discovery, error::BackendError, rename, repository::Repository};

fn fixture() -> Result<(tempfile::TempDir, Discovery), Box<dyn std::error::Error>> {
    let temp = tempfile::tempdir()?;
    let path = temp.path().join("rename.db");
    rusqlite::Connection::open(&path)?.execute_batch(include_str!("schema.sql"))?;
    let discovery = Discovery {
        repository: Repository::new(path, "test".into()),
        opencode: temp.path().join("must-not-run.exe"),
        supports_session: true,
    };
    Ok((temp, discovery))
}

#[test]
fn invalid_input_is_rejected_before_starting_a_process() -> Result<(), Box<dyn std::error::Error>> {
    let (_temp, discovery) = fixture()?;
    for (id, title) in [
        ("ses_a/evil", "title"),
        ("ses_a", " \n\t "),
        ("ses_a", "title\u{0000}"),
        ("ses_a", "title\nmore"),
        ("ses_", "title"),
    ] {
        assert!(matches!(
            rename::rename(&discovery, id, title),
            Err(BackendError::InvalidSession(_) | BackendError::Rename(_))
        ));
    }
    assert!(matches!(
        rename::rename(&discovery, "ses_a", &"界".repeat(501)),
        Err(BackendError::Rename(_))
    ));
    Ok(())
}

#[test]
fn missing_session_is_rejected_before_starting_a_process() -> Result<(), Box<dyn std::error::Error>>
{
    let (_temp, discovery) = fixture()?;
    assert!(matches!(
        rename::rename(&discovery, "ses_missing", "title"),
        Err(BackendError::MissingSession(_))
    ));
    Ok(())
}

#[cfg(windows)]
#[test]
fn v2_delete_missing_directory_uses_standalone_verified_cli_and_requires_persisted_deletion() {
    let (temp, mut discovery) = fixture().unwrap();
    let path = temp.path().join("rename.db");
    rusqlite::Connection::open(&path)
        .unwrap()
        .execute(
            "UPDATE session SET directory=?1",
            [temp.path().join("missing-project").to_str().unwrap()],
        )
        .unwrap();
    discovery.repository = Repository::new(path.clone(), "2.2.5".into());
    let executable = temp.path().join("synthetic.cmd");
    let marker = temp.path().join("delete-called");
    std::fs::write(&executable, format!(
        "@echo off\r\nif \"%1 %2 %3\"==\"session delete --help\" (echo opencode session delete [flags] ^<sessionID^>& exit /b 0)\r\nif \"%1 %2 %3\"==\"debug paths db\" (echo {}& exit /b 0)\r\nif \"%1 %2 %3 %4\"==\"--standalone session delete ses_c\" (echo called>\"{}\"& exit /b 0)\r\nexit /b 71\r\n",
        path.display(), marker.display()
    )).unwrap();
    discovery.opencode = executable;
    assert!(session_manager::deletion::delete(&discovery, &["ses_a".into()]).is_err());
    assert!(!marker.exists());
    let result = session_manager::deletion::delete(&discovery, &["ses_c".into()]).unwrap();
    assert!(marker.exists(), "verified V2 command must reach delete");
    assert!(result.deleted_ids.is_empty());
    assert_eq!(result.errors.len(), 1);
    assert!(
        result
            .catalog
            .sessions
            .iter()
            .any(|session| session.id == "ses_c")
    );

    std::fs::remove_file(&marker).unwrap();
    let script = std::fs::read_to_string(&discovery.opencode).unwrap();
    let wrong = temp.path().join("wrong.db");
    std::fs::write(&wrong, "not the selected database").unwrap();
    std::fs::write(
        &discovery.opencode,
        script.replace(&path.display().to_string(), &wrong.display().to_string()),
    )
    .unwrap();
    let result = session_manager::deletion::delete(&discovery, &["ses_c".into()]).unwrap();
    assert!(
        !marker.exists(),
        "database mismatch must block the mutation"
    );
    assert!(result.deleted_ids.is_empty());
    assert!(result.errors[0].contains("database path changed"));
}
