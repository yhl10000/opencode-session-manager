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

fn v2_fixture(mixed: bool) -> Result<(TempDir, Repository), Box<dyn std::error::Error>> {
    let temp = TempDir::new()?;
    let path = temp.path().join("v2.db");
    let db = Connection::open(&path)?;
    if mixed {
        db.execute_batch(include_str!("schema.sql"))?;
    }
    db.execute_batch(include_str!("schema-v2.sql"))?;
    Ok((temp, Repository::new(path, "2.2.5".into())))
}

#[test]
fn mixed_catalog_uses_only_v2_with_message_metadata_and_tokens() {
    let (_temp, repo) = v2_fixture(true).unwrap();
    let catalog = repo.catalog().unwrap();
    assert_eq!(catalog.sessions.len(), 1);
    let session = &catalog.sessions[0];
    assert_eq!(session.id, "ses_v2");
    assert_eq!(session.message_count, 3);
    assert_eq!(session.model.as_deref(), Some("new-model"));
    assert_eq!(session.provider.as_deref(), Some("new-provider"));
    assert_eq!(session.tokens, Some(20));
    assert_eq!(catalog.projects.len(), 1);
    assert!(repo.session("ses_a").is_err());
}

#[test]
fn v2_detail_reads_message_type_seq_and_text_parts_by_ordinal() {
    let (_temp, repo) = v2_fixture(false).unwrap();
    Connection::open(repo.database_path()).unwrap().execute(
        "INSERT INTO session_part VALUES ('msg_user','ses_v2',1,'text',1,1,'{\"text\":\"not a user prompt\"}')", [],
    ).unwrap();
    let detail = repo.detail("ses_v2").unwrap();
    assert_eq!(detail.session.title, "");
    assert_eq!(detail.session.message_count, 3);
    assert_eq!(detail.session.model.as_deref(), Some("new-model"));
    assert_eq!(detail.session.tokens, Some(20));
    assert_eq!(
        detail
            .preview
            .iter()
            .map(|m| m.id.as_str())
            .collect::<Vec<_>>(),
        ["msg_user", "msg_old", "msg_new"]
    );
    assert_eq!(detail.preview[0].role, "user");
    assert_eq!(detail.preview[0].text, "question");
    assert_eq!(detail.preview[2].role, "assistant");
    assert_eq!(detail.preview[2].text, "first\nsecond");
    assert!(!detail.preview_truncated);
    assert!(
        repo.connect()
            .unwrap()
            .execute("DELETE FROM session_v2", [])
            .is_err()
    );
}

#[test]
fn empty_v2_never_falls_back_to_legacy_sessions() {
    let (_temp, repo) = v2_fixture(true).unwrap();
    Connection::open(repo.database_path())
        .unwrap()
        .execute("DELETE FROM session_v2", [])
        .unwrap();
    assert!(repo.catalog().unwrap().sessions.is_empty());
    assert!(repo.detail("ses_a").is_err());
}

#[test]
fn mixed_detail_finds_current_v2_session() {
    let (_temp, repo) = v2_fixture(true).unwrap();
    assert_eq!(repo.detail("ses_v2").unwrap().session.id, "ses_v2");
}

#[test]
fn v2_preview_keeps_last_forty_and_unicode_budgets() {
    let (_temp, repo) = v2_fixture(false).unwrap();
    let db = Connection::open(repo.database_path()).unwrap();
    let data = serde_json::json!({"text": "中".repeat(5000)}).to_string();
    for seq in 4..=45 {
        db.execute(
            "INSERT INTO session_message VALUES (?1,'ses_v2','user',?2,?2,?2,?3)",
            rusqlite::params![format!("msg_{seq}"), seq, data],
        )
        .unwrap();
    }
    let detail = repo.detail("ses_v2").unwrap();
    assert_eq!(detail.preview.len(), 40);
    assert_eq!(detail.preview[0].id, "msg_6");
    assert_eq!(detail.preview[39].id, "msg_45");
    assert!(detail.preview_truncated);
    assert!(
        detail
            .preview
            .iter()
            .all(|m| m.text.chars().count() <= 4000)
    );
    assert_eq!(
        detail
            .preview
            .iter()
            .map(|m| m.text.chars().count())
            .sum::<usize>(),
        24000
    );
}

#[test]
fn v2_session_model_takes_precedence_and_invalid_message_json_is_safe() {
    let (_temp, repo) = v2_fixture(false).unwrap();
    let db = Connection::open(repo.database_path()).unwrap();
    db.execute(
        r#"UPDATE session_v2 SET model='{"id":"selected","providerID":"selected-provider"}'"#,
        [],
    )
    .unwrap();
    db.execute(
        "INSERT INTO session_message VALUES ('msg_invalid','ses_v2','assistant',4,4,4,'invalid')",
        [],
    )
    .unwrap();
    let session = repo.session("ses_v2").unwrap();
    assert_eq!(session.model.as_deref(), Some("selected"));
    assert_eq!(session.provider.as_deref(), Some("selected-provider"));
    db.execute("UPDATE session_v2 SET model=NULL", []).unwrap();
    assert_eq!(
        repo.detail("ses_v2").unwrap().session.model.as_deref(),
        Some("new-model")
    );
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
fn catalog_groups_all_sessions_by_their_working_directories() {
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
    assert_eq!(catalog.sessions[0].project_id, "directory:q:/git/sub");
    assert_eq!(
        catalog.sessions[1].project_id,
        catalog.sessions[2].project_id
    );
    assert_eq!(catalog.projects.len(), 2);
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
