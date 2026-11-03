use crate::{
    dto::{PreviewMessage, SessionSummary},
    error::Result,
};
use rusqlite::Connection;

const MESSAGE_LIMIT: usize = 40;
const MESSAGE_CHAR_LIMIT: usize = 4_000;
const TOTAL_CHAR_LIMIT: usize = 24_000;

pub(crate) fn read(
    db: &Connection,
    session: &SessionSummary,
    v2: bool,
) -> Result<(Vec<PreviewMessage>, bool)> {
    let messages_sql = if v2 {
        "SELECT id,type,time_created FROM session_message WHERE session_id=?1 ORDER BY seq DESC LIMIT 40"
    } else {
        "SELECT id,CASE WHEN json_valid(data) THEN coalesce(json_extract(data,'$.role'),'unknown') ELSE 'unknown' END,time_created
        FROM message WHERE session_id=?1 ORDER BY time_created DESC,id DESC LIMIT 40"
    };
    let mut preview = db
        .prepare(messages_sql)?
        .query_map([&session.id], |row| {
            Ok(PreviewMessage {
                id: row.get(0)?,
                role: row.get(1)?,
                created_at: row.get(2)?,
                text: String::new(),
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    preview.reverse();
    let mut truncated = session.message_count > i64::try_from(MESSAGE_LIMIT).unwrap_or(i64::MAX);
    let mut remaining = TOTAL_CHAR_LIMIT;
    let parts_sql = if v2 {
        "SELECT substr(json_extract(data,'$.text'),1,4001) FROM session_message
         WHERE id=?1 AND session_id=?2 AND type IN ('user','synthetic','system','skill') AND json_valid(data) AND json_type(data,'$.text')='text'
         UNION ALL SELECT substr(json_extract(data,'$.text'),1,4001) FROM
         (SELECT data FROM session_part WHERE message_id=?1 AND session_id=?2 AND type='text' AND json_valid(data) AND json_type(data,'$.text')='text'
          AND EXISTS(SELECT 1 FROM session_message WHERE id=?1 AND session_id=?2 AND type='assistant') ORDER BY ordinal LIMIT 65)"
    } else {
        "SELECT substr(json_extract(data,'$.text'),1,4001) FROM part
        WHERE message_id=?1 AND session_id=?2 AND json_valid(data) AND json_extract(data,'$.type')='text'
        ORDER BY time_created,id LIMIT 65"
    };
    let mut parts = db.prepare(parts_sql)?;
    for message in &mut preview {
        let mut budget = MESSAGE_CHAR_LIMIT.min(remaining);
        let mut rows = parts.query([&message.id, &session.id])?;
        let mut count = 0usize;
        while let Some(row) = rows.next()? {
            count = count.saturating_add(1);
            if count == 65 {
                truncated = true;
                break;
            }
            let text: Option<String> = row.get(0)?;
            if let Some(text) = text {
                if !message.text.is_empty() && !text.is_empty() {
                    if budget == 0 {
                        truncated = true;
                    } else {
                        message.text.push('\n');
                        budget = budget.saturating_sub(1);
                        remaining = remaining.saturating_sub(1);
                    }
                }
                let kept: String = text.chars().take(budget).collect();
                let used = kept.chars().count();
                truncated |= text.chars().count() > used;
                message.text.push_str(&kept);
                budget = budget.saturating_sub(used);
                remaining = remaining.saturating_sub(used);
            }
        }
    }
    Ok((preview, truncated))
}
