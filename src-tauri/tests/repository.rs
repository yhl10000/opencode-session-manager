use rusqlite::Connection;
use session_manager::repository::Repository;
use tempfile::TempDir;

fn fixture() -> Result<(TempDir, Repository), Box<dyn std::error::Error>> {
    let temp = TempDir::new()?;
    let path = temp.path().join("sessions.db");
    let db = Connection::open(&path)?;
    db.execute_batch(include_str!("schema.sql"))?;
    Ok((temp, Repository::new(path, "test".into())))
}

#[test]
fn missing_database_is_never_created() {
    let temp = TempDir::new().unwrap();
    let path = temp.path().join("missing.db");

    let result = Repository::new(path.clone(), "test".into()).catalog();

    assert!(result.is_err());
    assert!(!path.exists());
}

#[test]
fn incompatible_schema_is_reported() {
    let temp = TempDir::new().unwrap();
    let path = temp.path().join("wrong.db");
    Connection::open(&path).unwrap();

    let result = Repository::new(path, "test".into()).catalog();

    assert!(result.is_err());
}

#[test]
fn catalog_preserves_real_projects_and_groups_global_directories() {
    let (_temp, repo) = fixture().unwrap();

    let catalog = repo.catalog().unwrap();

    assert_eq!(
        catalog
            .sessions
            .iter()
            .map(|s| s.id.as_str())
            .collect::<Vec<_>>(),
        ["ses_c", "ses_b", "ses_a"]
    );
    assert_eq!(catalog.sessions[0].project_id, "git");
    assert_eq!(
        catalog.sessions[1].project_id,
        catalog.sessions[2].project_id
    );
    assert!(catalog.projects.iter().any(|p| p.id == "empty"));
    assert_eq!(catalog.sessions[2].message_count, 45);
    assert_eq!(catalog.sessions[2].model.as_deref(), Some("model-x"));
    assert_eq!(catalog.sessions[2].provider.as_deref(), Some("provider-x"));
    assert_eq!(catalog.sessions[2].tokens, None);
    assert_eq!(catalog.sessions[1].tokens, Some(12));
}

#[test]
fn detail_keeps_last_forty_in_chronological_order() {
    let (_temp, repo) = fixture().unwrap();

    let detail = repo.detail("ses_a").unwrap();

    assert_eq!(detail.preview.len(), 40);
    assert_eq!(detail.preview.first().unwrap().created_at, 6);
    assert_eq!(detail.preview.last().unwrap().created_at, 45);
    assert!(detail.preview_truncated);
    assert_eq!(detail.preview.first().unwrap().text, "hello");
}

#[test]
fn detail_rejects_unknown_session() {
    let (_temp, repo) = fixture().unwrap();

    let result = repo.detail("ses_missing");

    assert!(result.is_err());
}

#[test]
fn reader_connection_cannot_write() {
    let (_temp, repo) = fixture().unwrap();
    let db = repo.connect().unwrap();

    let result = db.execute("DELETE FROM session", []);

    assert!(result.is_err());
}

#[test]
fn preview_limits_unicode_text_and_excludes_tools() {
    let (_temp, repo) = fixture().unwrap();
    let db = Connection::open(repo.catalog().unwrap().database_path).unwrap();
    let text = "中".repeat(5000);
    let data = serde_json::json!({"type":"text","text":text}).to_string();
    db.execute("UPDATE part SET data=?1", [data]).unwrap();
    db.execute("INSERT INTO part VALUES('tool','msg_45','ses_a',46,'{\"type\":\"tool\",\"text\":\"secret\"}')", []).unwrap();

    let detail = repo.detail("ses_a").unwrap();

    assert!(detail.preview_truncated);
    assert!(
        detail
            .preview
            .iter()
            .all(|message| message.text.chars().count() <= 4000)
    );
    assert_eq!(
        detail
            .preview
            .iter()
            .map(|message| message.text.chars().count())
            .sum::<usize>(),
        24000
    );
    assert!(
        detail
            .preview
            .iter()
            .all(|message| !message.text.contains("secret"))
    );
}

#[test]
fn empty_preview_is_not_reported_truncated() {
    let (_temp, repo) = fixture().unwrap();

    let detail = repo.detail("ses_c").unwrap();

    assert!(detail.preview.is_empty());
    assert!(!detail.preview_truncated);
}

#[test]
fn missing_session_is_rejected_before_any_launch() {
    let (_temp, repo) = fixture().unwrap();
    let discovery = session_manager::discovery::Discovery {
        repository: repo,
        opencode: "missing.exe".into(),
        supports_session: true,
    };

    let result = session_manager::launcher::launch(
        &discovery,
        "ses_missing",
        session_manager::launcher::LaunchMode::Tab,
    );

    assert!(matches!(
        result,
        Err(session_manager::error::BackendError::MissingSession(_))
    ));
}

#[test]
fn missing_directory_is_rejected_before_executable_resolution() {
    let (temp, repo) = fixture().unwrap();
    let missing = temp.path().join("missing-directory");
    let db = Connection::open(repo.catalog().unwrap().database_path).unwrap();
    db.execute(
        "UPDATE session SET directory=?1 WHERE id='ses_c'",
        [missing.to_string_lossy()],
    )
    .unwrap();
    let discovery = session_manager::discovery::Discovery {
        repository: repo,
        opencode: "missing.exe".into(),
        supports_session: true,
    };

    let result = session_manager::launcher::launch(
        &discovery,
        "ses_c",
        session_manager::launcher::LaunchMode::Window,
    );

    assert!(matches!(
        result,
        Err(session_manager::error::BackendError::MissingDirectory(_))
    ));
}

#[test]
fn global_sessions_in_different_directories_have_distinct_projects() {
    let (_temp, repo) = fixture().unwrap();
    let db = Connection::open(repo.catalog().unwrap().database_path).unwrap();
    db.execute(
        "UPDATE session SET directory='Q:/other' WHERE id='ses_b'",
        [],
    )
    .unwrap();

    let catalog = repo.catalog().unwrap();

    assert_ne!(
        catalog.sessions[1].project_id,
        catalog.sessions[2].project_id
    );
}

#[test]
fn latest_assistant_supplements_missing_model_metadata() {
    let (_temp, repo) = fixture().unwrap();
    let db = Connection::open(repo.catalog().unwrap().database_path).unwrap();
    db.execute("INSERT INTO message VALUES('old','ses_c',1,'{\"role\":\"assistant\",\"modelID\":\"old\",\"providerID\":\"old\"}')", []).unwrap();
    db.execute("INSERT INTO message VALUES('new','ses_c',2,'{\"role\":\"assistant\",\"modelID\":\"new-model\",\"providerID\":\"new-provider\"}')", []).unwrap();

    let detail = repo.detail("ses_c").unwrap();

    assert_eq!(detail.session.model.as_deref(), Some("new-model"));
    assert_eq!(detail.session.provider.as_deref(), Some("new-provider"));
}

#[test]
fn missing_opencode_executable_is_rejected_before_dispatch() {
    let (temp, repo) = fixture().unwrap();
    let db = Connection::open(repo.catalog().unwrap().database_path).unwrap();
    db.execute(
        "UPDATE session SET directory=?1 WHERE id='ses_c'",
        [temp.path().to_string_lossy()],
    )
    .unwrap();
    let discovery = session_manager::discovery::Discovery {
        repository: repo,
        opencode: temp.path().join("missing.exe"),
        supports_session: true,
    };

    let result = session_manager::launcher::launch(
        &discovery,
        "ses_c",
        session_manager::launcher::LaunchMode::Tab,
    );

    assert!(matches!(
        result,
        Err(session_manager::error::BackendError::Executable(_))
    ));
}
