use crate::dto::{Project, SessionSummary};
use std::collections::{BTreeMap, BTreeSet};

fn normalized_directory(directory: &str) -> String {
    let replaced = directory.replace('\\', "/");
    let trimmed = replaced.trim_end_matches('/');
    #[cfg(windows)]
    let trimmed = trimmed.to_lowercase();
    #[cfg(not(windows))]
    let trimmed = trimmed.to_owned();
    if trimmed.is_empty() {
        "/".into()
    } else {
        trimmed
    }
}

pub(crate) fn group_global(projects: &mut Vec<Project>, sessions: &mut [SessionSummary]) {
    let global_ids: BTreeSet<String> = projects
        .iter()
        .filter(|p| p.path == "/" || p.path == "\\")
        .map(|p| p.id.clone())
        .collect();
    let mut synthetic = BTreeMap::new();
    for session in sessions {
        if global_ids.contains(&session.project_id) {
            let normalized = normalized_directory(&session.directory);
            let id = format!("directory:{normalized}");
            session.project_id.clone_from(&id);
            synthetic.entry(id.clone()).or_insert_with(|| Project {
                id,
                name: directory_name(&session.directory),
                path: session.directory.clone(),
            });
        }
    }
    projects.extend(synthetic.into_values());
    projects.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then(left.id.cmp(&right.id))
    });
}

pub(crate) fn directory_name(path: &str) -> String {
    path.trim_end_matches(['/', '\\'])
        .rsplit(['/', '\\'])
        .find(|part| !part.is_empty())
        .unwrap_or(path)
        .to_owned()
}
