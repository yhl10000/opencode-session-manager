use rusqlite::Connection;
use session_manager::repository::Repository;
use tempfile::TempDir;

fn fixture() -> Result<(TempDir, Repository), Box<dyn std::error::Error>> {
    let temp = TempDir::new()?;
    let path = temp.path().join("groups.db");
    Connection::open(&path)?.execute_batch(include_str!("schema.sql"))?;
    Ok((temp, Repository::new(path, "test".into())))
}

#[test]
fn groups_follow_session_directories_instead_of_database_project_names() {
    let (_temp, repo) = fixture().unwrap();

    let catalog = repo.catalog().unwrap();
    let session = catalog.sessions.iter().find(|s| s.id == "ses_c").unwrap();
    let group = catalog
        .projects
        .iter()
        .find(|p| p.id == session.project_id)
        .unwrap();

    assert_eq!(group.name, "sub");
    assert_eq!(group.path, "Q:\\git\\sub");
    assert!(!catalog.projects.iter().any(|p| p.path == "/"));
    assert!(
        !catalog
            .projects
            .iter()
            .any(|p| p.name == "Git" || p.name == "Empty")
    );
    assert_eq!(repo.detail("ses_c").unwrap().session.project_id, group.id);
}

#[test]
fn sessions_with_different_database_projects_share_the_same_directory_group() {
    let (_temp, repo) = fixture().unwrap();
    let db = Connection::open(repo.catalog().unwrap().database_path).unwrap();
    db.execute(
        "UPDATE session SET directory='Q:/Work/Folder' WHERE id='ses_c'",
        [],
    )
    .unwrap();

    let catalog = repo.catalog().unwrap();

    assert_eq!(catalog.projects.len(), 1);
    assert!(
        catalog
            .sessions
            .iter()
            .all(|s| s.project_id == catalog.projects[0].id)
    );
}

#[test]
fn equal_folder_names_at_different_paths_remain_separate() {
    let (_temp, repo) = fixture().unwrap();
    let db = Connection::open(repo.catalog().unwrap().database_path).unwrap();
    db.execute(
        "UPDATE session SET directory='Q:/another/Folder' WHERE id='ses_c'",
        [],
    )
    .unwrap();

    let catalog = repo.catalog().unwrap();

    assert_eq!(catalog.projects.len(), 2);
    assert!(
        catalog
            .projects
            .iter()
            .all(|p| p.name.eq_ignore_ascii_case("Folder"))
    );
    assert_ne!(catalog.projects[0].id, catalog.projects[1].id);
}

#[test]
fn catalog_and_detail_do_not_require_database_project_rows() {
    let (_temp, repo) = fixture().unwrap();
    let db = Connection::open(repo.catalog().unwrap().database_path).unwrap();
    db.execute("DROP TABLE project", []).unwrap();

    let catalog = repo.catalog().unwrap();

    assert_eq!(catalog.sessions.len(), 3);
    assert_eq!(catalog.projects.len(), 2);
    assert_eq!(
        repo.detail("ses_c").unwrap().session.project_id,
        "directory:q:/git/sub"
    );
}

#[test]
fn drive_root_and_drive_relative_directory_remain_distinct() {
    let (_temp, repo) = fixture().unwrap();
    let db = Connection::open(repo.catalog().unwrap().database_path).unwrap();
    db.execute("UPDATE session SET directory='Q:/' WHERE id='ses_a'", [])
        .unwrap();
    db.execute("UPDATE session SET directory='Q:' WHERE id='ses_b'", [])
        .unwrap();

    let catalog = repo.catalog().unwrap();

    let absolute = catalog.sessions.iter().find(|s| s.id == "ses_a").unwrap();
    let relative = catalog.sessions.iter().find(|s| s.id == "ses_b").unwrap();
    assert_ne!(absolute.project_id, relative.project_id);
    assert_eq!(absolute.project_id, "directory:q:/");
}
