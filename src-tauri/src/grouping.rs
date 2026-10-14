use crate::dto::{Project, SessionSummary};
use std::collections::BTreeMap;

fn normalized_directory(directory: &str) -> String {
    let replaced = directory.replace('\\', "/");
    let trimmed = replaced.trim_end_matches('/');
    let drive_root = replaced.ends_with('/')
        && trimmed.len() == 2
        && trimmed.as_bytes()[0].is_ascii_alphabetic()
        && trimmed.as_bytes()[1] == b':';
    let trimmed = if drive_root {
        format!("{trimmed}/")
    } else {
        trimmed.to_owned()
    };
    #[cfg(windows)]
    let trimmed = trimmed.to_lowercase();
    if trimmed.is_empty() {
        "/".into()
    } else {
        trimmed
    }
}

pub(crate) fn group_directories(sessions: &mut [SessionSummary]) -> Vec<Project> {
    let mut synthetic = BTreeMap::new();
    for session in sessions {
        let normalized = normalized_directory(&session.directory);
        let id = format!("directory:{normalized}");
        session.project_id.clone_from(&id);
        synthetic.entry(id.clone()).or_insert_with(|| Project {
            id,
            name: directory_name(&session.directory),
            path: session.directory.clone(),
        });
    }
    let mut projects: Vec<Project> = synthetic.into_values().collect();
    projects.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then(left.id.cmp(&right.id))
    });
    projects
}

pub(crate) fn directory_name(path: &str) -> String {
    path.trim_end_matches(['/', '\\'])
        .rsplit(['/', '\\'])
        .find(|part| !part.is_empty())
        .unwrap_or(path)
        .to_owned()
}
