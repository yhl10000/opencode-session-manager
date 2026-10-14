use crate::{
    discovery::{Discovery, metadata_output},
    dto::{DeleteResult, SessionSummary},
    error::{BackendError, Result},
    launcher::validate_session_id,
    repository::Repository,
};
use std::collections::BTreeSet;

pub fn execute(
    repo: &Repository,
    ids: &[String],
    mut remove: impl FnMut(&SessionSummary) -> Result<()>,
) -> Result<DeleteResult> {
    let mut remaining: BTreeSet<String> = ids.iter().cloned().collect();
    if ids.is_empty() || remaining.len() != ids.len() {
        return Err(BackendError::Deletion(
            "Select a nonempty set of distinct sessions.".into(),
        ));
    }
    let initial = repo.catalog()?;
    for id in ids {
        validate_session_id(id)?;
        if !initial.sessions.iter().any(|s| &s.id == id) {
            return Err(BackendError::MissingSession(id.clone()));
        }
    }
    if initial.sessions.iter().any(|s| {
        s.parent_id.as_ref().is_some_and(|p| remaining.contains(p)) && !remaining.contains(&s.id)
    }) {
        return Err(BackendError::Deletion("A selected session has child sessions outside this selection. Delete its children first.".into()));
    }
    let mut deleted_ids = Vec::new();
    let mut errors = Vec::new();
    while !remaining.is_empty() {
        let current = repo.catalog()?;
        let next = current.sessions.iter().find(|s| {
            remaining.contains(&s.id)
                && !current
                    .sessions
                    .iter()
                    .any(|child| child.parent_id.as_deref() == Some(&s.id))
        });
        let Some(session) = next else {
            errors.push("Deletion stopped: child relationships changed or selected sessions disappeared. Refresh and confirm again.".into());
            break;
        };
        match remove(session) {
            Ok(()) => {
                let after = repo.catalog()?;
                if after.sessions.iter().any(|s| s.id == session.id) {
                    errors.push(format!(
                        "OpenCode did not remove {}. Refresh and retry.",
                        session.id
                    ));
                    break;
                }
                remaining.remove(&session.id);
                deleted_ids.push(session.id.clone());
            }
            Err(error) => {
                errors.push(format!("Deletion stopped at {}: {error}", session.id));
                break;
            }
        }
    }
    Ok(DeleteResult {
        catalog: repo.catalog()?,
        deleted_ids,
        errors,
    })
}

pub fn delete(discovery: &Discovery, ids: &[String]) -> Result<DeleteResult> {
    let help = metadata_output(&discovery.opencode, &["session", "delete", "--help"])?;
    if !help.contains("delete <sessionID>") {
        return Err(BackendError::Deletion(
            "Installed OpenCode does not support the verified session delete command.".into(),
        ));
    }
    execute(&discovery.repository, ids, |session| {
        metadata_output(
            &discovery.opencode,
            &["--pure", "session", "delete", &session.id],
        )?;
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use tempfile::TempDir;

    fn fixture() -> Result<(TempDir, Repository)> {
        let temp = TempDir::new()?;
        let path = temp.path().join("delete.db");
        Connection::open(&path)?.execute_batch(include_str!("../tests/schema.sql"))?;
        Ok((temp, Repository::new(path, "test".into())))
    }

    #[test]
    fn single_parent_deletion_is_blocked_before_executor_runs() {
        let (_temp, repo) = fixture().unwrap();
        let mut calls = 0;
        let result = execute(&repo, &["ses_a".into()], |_| {
            calls += 1;
            Ok(())
        });
        assert!(result.is_err());
        assert_eq!(calls, 0);
    }

    #[test]
    fn confirmed_set_deletes_children_first_and_removes_empty_group() {
        let (_temp, repo) = fixture().unwrap();
        let path = repo.catalog().unwrap().database_path;
        let mut calls = Vec::new();
        let result = execute(&repo, &["ses_a".into(), "ses_b".into()], |session| {
            calls.push(session.id.clone());
            Connection::open(&path)?.execute("DELETE FROM session WHERE id=?1", [&session.id])?;
            Ok(())
        })
        .unwrap();
        assert_eq!(calls, ["ses_b", "ses_a"]);
        assert_eq!(result.deleted_ids.len(), 2);
        assert_eq!(result.catalog.sessions.len(), 1);
        assert_eq!(result.catalog.projects.len(), 1);
    }

    #[test]
    fn unchanged_database_is_reported_as_failure_not_success() {
        let (_temp, repo) = fixture().unwrap();
        let result = execute(&repo, &["ses_c".into()], |_| Ok(())).unwrap();
        assert!(result.deleted_ids.is_empty());
        assert_eq!(result.errors.len(), 1);
    }

    #[test]
    fn missing_id_and_duplicate_id_are_rejected_before_execution() {
        let (_temp, repo) = fixture().unwrap();
        assert!(execute(&repo, &["ses_missing".into()], |_| panic!("must not run")).is_err());
        assert!(
            execute(&repo, &["ses_c".into(), "ses_c".into()], |_| panic!(
                "must not run"
            ))
            .is_err()
        );
    }

    #[test]
    fn failure_returns_completed_deletions_and_remaining_catalog() {
        let (_temp, repo) = fixture().unwrap();
        let path = repo.catalog().unwrap().database_path;
        let result = execute(&repo, &["ses_a".into(), "ses_b".into()], |session| {
            if session.id == "ses_a" {
                return Err(BackendError::Deletion("fixture failure".into()));
            }
            Connection::open(&path)?.execute("DELETE FROM session WHERE id=?1", [&session.id])?;
            Ok(())
        })
        .unwrap();
        assert_eq!(result.deleted_ids, ["ses_b"]);
        assert_eq!(result.errors.len(), 1);
        assert!(result.catalog.sessions.iter().any(|s| s.id == "ses_a"));
    }
}
