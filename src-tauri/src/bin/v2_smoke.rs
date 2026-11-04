use session_manager::{deletion, discovery, open_directory, rename};
use std::{collections::BTreeSet, path::PathBuf};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(std::env::var("V2_SMOKE_ROOT")?).canonicalize()?;
    for key in [
        "HOME",
        "USERPROFILE",
        "XDG_DATA_HOME",
        "XDG_CONFIG_HOME",
        "XDG_CACHE_HOME",
        "XDG_STATE_HOME",
        "APPDATA",
        "LOCALAPPDATA",
        "OPENCODE_DB",
    ] {
        let path = PathBuf::from(std::env::var(key)?).canonicalize()?;
        if path == root || !path.starts_with(&root) {
            return Err(format!("Refusing smoke outside sandbox: {key}").into());
        }
    }
    let ids: Vec<String> = std::env::args().skip(1).collect();
    let [parent, child, independent] = ids.as_slice() else {
        return Err("Expected three synthetic session IDs".into());
    };
    if ids.iter().collect::<BTreeSet<_>>().len() != 3 {
        return Err("Expected distinct synthetic session IDs".into());
    }
    let discovery = discovery::discover()?;
    let repo = &discovery.repository;
    if !repo.database_path().canonicalize()?.starts_with(&root)
        || repo.database_path().canonicalize()?
            != PathBuf::from(std::env::var("OPENCODE_DB")?).canonicalize()?
    {
        return Err("Refusing database outside sandbox or different from OPENCODE_DB".into());
    }
    assert!(
        discovery.supports_session,
        "Installed V2 must advertise --session"
    );
    let catalog = repo.catalog()?;
    assert_eq!(catalog.sessions.len(), 3);
    assert_eq!(catalog.projects.len(), 2);
    for id in &ids {
        let detail = repo.detail(id)?;
        assert_eq!(&detail.session.id, id);
        let directory = PathBuf::from(&detail.session.directory).canonicalize()?;
        if !directory.starts_with(&root) || directory == root {
            return Err("Refusing session workspace outside sandbox".into());
        }
        assert_eq!(
            open_directory::explorer_directory(&detail.session.directory)?.canonicalize()?,
            directory
        );
    }
    assert_eq!(repo.session(child)?.parent_id.as_ref(), Some(parent));
    assert_eq!(
        repo.session(parent)?.directory,
        repo.session(child)?.directory
    );
    assert_ne!(
        repo.session(parent)?.directory,
        repo.session(independent)?.directory
    );
    assert!(
        repo.connect()?
            .execute_batch("CREATE TABLE should_not_write (id INTEGER)")
            .is_err()
    );
    let title = "  Backend V2 renamed 中文 \"quotes\"  ";
    let renamed = rename::rename(&discovery, parent, title)?;
    assert!(
        renamed
            .sessions
            .iter()
            .any(|session| &session.id == parent && session.title == title.trim())
    );
    assert_eq!(repo.session(parent)?.title, title.trim());
    assert!(deletion::delete(&discovery, std::slice::from_ref(parent)).is_err());
    assert_eq!(repo.catalog()?.sessions.len(), 3);
    for id in &ids {
        repo.detail(id)?;
    }
    let deleted = deletion::delete(&discovery, std::slice::from_ref(independent))?;
    assert!(deleted.errors.is_empty(), "{:?}", deleted.errors);
    assert_eq!(
        deleted.deleted_ids.as_slice(),
        std::slice::from_ref(independent)
    );
    assert_eq!(deleted.catalog.sessions.len(), 2);
    assert_eq!(deleted.catalog.projects.len(), 1);
    assert!(
        deleted
            .catalog
            .sessions
            .iter()
            .all(|session| &session.id == parent || &session.id == child)
    );
    let deleted = deletion::delete(&discovery, &[parent.clone(), child.clone()])?;
    assert!(deleted.errors.is_empty(), "{:?}", deleted.errors);
    assert_eq!(deleted.deleted_ids, [child.clone(), parent.clone()]);
    assert!(deleted.catalog.sessions.is_empty());
    assert!(deleted.catalog.projects.is_empty());
    assert!(repo.catalog()?.sessions.is_empty());
    println!(
        "Installed version: {}; supportsSession=true; project grouping/detail/readonly/explorer path/rename/delete passed",
        catalog.opencode_version
    );
    Ok(())
}
