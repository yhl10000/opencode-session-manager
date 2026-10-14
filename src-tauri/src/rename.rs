use crate::{
    discovery::Discovery,
    dto::Catalog,
    error::{BackendError, Result},
    launcher::validate_session_id,
    rename_api::{RenameApi, parse_endpoint},
    rename_process::{Credentials, OwnedProcess, command},
};
use std::path::{Path, PathBuf};

pub fn rename(discovery: &Discovery, id: &str, title: &str) -> Result<Catalog> {
    validate_session_id(id)?;
    if id.len() <= 4 {
        return Err(BackendError::InvalidSession(id.into()));
    }
    let title = title.trim();
    if title.is_empty() || title.chars().count() > 500 || title.chars().any(char::is_control) {
        return Err(BackendError::Rename(
            "Title must contain 1 to 500 characters without control characters".into(),
        ));
    }
    let session = discovery.repository.session(id)?;
    let directory = Path::new(&session.directory);
    if !directory.is_dir() {
        return Err(BackendError::MissingDirectory(session.directory));
    }
    let mut check = command(&discovery.opencode, directory);
    check.args(["--pure", "db", "path"]);
    let path = PathBuf::from(OwnedProcess::start(&mut check)?.capture()?);
    if path.canonicalize()? != discovery.repository.database_path().canonicalize()? {
        return Err(BackendError::Rename(
            "OpenCode database path changed since discovery; restart the app".into(),
        ));
    }
    let credentials = Credentials::random()?;
    let reserved = std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))?;
    let port = reserved.local_addr()?.port().to_string();
    drop(reserved);
    let mut serve = command(&discovery.opencode, directory);
    serve
        .args([
            "--pure",
            "serve",
            "--hostname",
            "127.0.0.1",
            "--port",
            &port,
            "--mdns=false",
        ])
        .env("OPENCODE_SERVER_USERNAME", &credentials.username)
        .env("OPENCODE_SERVER_PASSWORD", &credentials.password);
    let mut server = OwnedProcess::start(&mut serve)?;
    let endpoint = parse_endpoint(&server.first_line()?)?;
    if endpoint.port().map(|value| value.to_string()).as_deref() != Some(port.as_str()) {
        return Err(BackendError::Rename(
            "Server bound a different port than requested".into(),
        ));
    }
    server.ensure_running()?;
    let api = RenameApi::new(endpoint, credentials, &session.directory)?;
    api.verify_session(&session)?;
    server.ensure_running()?;
    api.update(id, title)?;
    server.stop()?;
    let catalog = discovery.repository.catalog()?;
    if !catalog
        .sessions
        .iter()
        .any(|session| session.id == id && session.title == title)
    {
        return Err(BackendError::Rename(
            "API update was not visible in the discovered database; refresh before retrying".into(),
        ));
    }
    Ok(catalog)
}
