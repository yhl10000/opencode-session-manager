use crate::{
    dto::{Catalog, SessionDetail, SessionSummary},
    error::{BackendError, Result},
    grouping::group_directories,
    preview,
};
use rusqlite::{Connection, OpenFlags, OptionalExtension, Row};
use std::{path::PathBuf, time::Duration};

#[derive(Debug, Clone)]
pub struct Repository {
    path: PathBuf,
    version: String,
}

const SESSION_FIELDS: &str = "s.id,s.project_id,s.title,s.directory,s.time_created,s.time_updated,
    coalesce(counts.amount,0),
    CASE WHEN json_valid(s.model) THEN coalesce(json_extract(s.model,'$.id'),json_extract(s.model,'$.modelID')) ELSE s.model END,
    CASE WHEN json_valid(s.model) THEN json_extract(s.model,'$.providerID') ELSE NULL END,
    CASE WHEN coalesce(s.tokens_input,0)+coalesce(s.tokens_output,0)+coalesce(s.tokens_reasoning,0)+coalesce(s.tokens_cache_read,0)+coalesce(s.tokens_cache_write,0)>0
    THEN coalesce(s.tokens_input,0)+coalesce(s.tokens_output,0)+coalesce(s.tokens_reasoning,0)+coalesce(s.tokens_cache_read,0)+coalesce(s.tokens_cache_write,0) ELSE NULL END,
    s.parent_id";

const LATEST_ASSISTANT: &str = "SELECT json_object('model',json_extract(data,'$.modelID'),'provider',json_extract(data,'$.providerID'))
    FROM message WHERE session_id=?1 AND json_valid(data) AND json_extract(data,'$.role')='assistant'
    ORDER BY time_created DESC,id DESC LIMIT 1";

#[derive(serde::Deserialize)]
struct AssistantMetadata {
    model: Option<String>,
    provider: Option<String>,
}

impl Repository {
    pub const fn new(path: PathBuf, version: String) -> Self {
        Self { path, version }
    }

    pub fn connect(&self) -> Result<Connection> {
        let connection = Connection::open_with_flags(
            &self.path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;
        connection.busy_timeout(Duration::from_secs(3))?;
        connection.pragma_update(None, "query_only", true)?;
        Ok(connection)
    }

    pub fn catalog(&self) -> Result<Catalog> {
        let mut db = self.connect()?;
        let transaction = db.transaction()?;
        let sql = format!("WITH counts AS (SELECT session_id,count(*) amount FROM message GROUP BY session_id)
            SELECT {SESSION_FIELDS} FROM session s LEFT JOIN counts ON counts.session_id=s.id ORDER BY s.time_updated DESC,s.id DESC");
        let mut sessions = transaction
            .prepare(&sql)?
            .query_map([], summary_row)?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        for session in &mut sessions {
            supplement_model(&transaction, session)?;
        }
        let projects = group_directories(&mut sessions);
        Ok(Catalog {
            database_path: self.path.to_string_lossy().into_owned(),
            opencode_version: self.version.clone(),
            projects,
            sessions,
        })
    }

    pub fn detail(&self, id: &str) -> Result<SessionDetail> {
        let mut db = self.connect()?;
        let transaction = db.transaction()?;
        let mut session = read_session(&transaction, id)?;
        group_directories(std::slice::from_mut(&mut session));
        let (preview, preview_truncated) = preview::read(&transaction, &session)?;
        Ok(SessionDetail {
            session,
            preview,
            preview_truncated,
        })
    }

    pub fn session(&self, id: &str) -> Result<SessionSummary> {
        read_session(&self.connect()?, id)
    }
}

fn read_session(db: &Connection, id: &str) -> Result<SessionSummary> {
    let sql = format!("WITH counts AS (SELECT session_id,count(*) amount FROM message WHERE session_id=?1 GROUP BY session_id)
        SELECT {SESSION_FIELDS} FROM session s LEFT JOIN counts ON counts.session_id=s.id WHERE s.id=?1");
    let mut session = db
        .query_row(&sql, [id], summary_row)
        .optional()?
        .ok_or_else(|| BackendError::MissingSession(id.into()))?;
    supplement_model(db, &mut session)?;
    Ok(session)
}

fn summary_row(row: &Row<'_>) -> rusqlite::Result<SessionSummary> {
    Ok(SessionSummary {
        id: row.get(0)?,
        project_id: row.get(1)?,
        title: row.get(2)?,
        directory: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
        message_count: row.get(6)?,
        model: row.get(7)?,
        provider: row.get(8)?,
        tokens: row.get(9)?,
        parent_id: row.get(10)?,
    })
}

fn supplement_model(db: &Connection, session: &mut SessionSummary) -> Result<()> {
    if session.model.is_none() || session.provider.is_none() {
        let raw: Option<String> = db
            .query_row(LATEST_ASSISTANT, [&session.id], |row| row.get(0))
            .optional()?;
        if let Some(raw) = raw {
            let metadata: AssistantMetadata = serde_json::from_str(&raw).map_err(|error| {
                BackendError::Discovery(format!("Invalid assistant metadata: {error}"))
            })?;
            session.model = session.model.take().or(metadata.model);
            session.provider = session.provider.take().or(metadata.provider);
        }
    }
    Ok(())
}
