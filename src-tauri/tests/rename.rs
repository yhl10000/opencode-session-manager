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
