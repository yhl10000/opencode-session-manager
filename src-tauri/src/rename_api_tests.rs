use super::*;
use base64::{Engine, engine::general_purpose::STANDARD};
use std::{
    io::{BufRead, BufReader, Read, Write},
    net::TcpListener,
    sync::mpsc,
    thread,
};

fn fake(
    response: impl Into<String>,
) -> (RenameApi, mpsc::Receiver<String>, thread::JoinHandle<()>) {
    let response = response.into();
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = reqwest::Url::parse(&format!("http://{}/", listener.local_addr().unwrap())).unwrap();
    let (sender, receiver) = mpsc::channel();
    let worker = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        let mut reader = BufReader::new(stream.try_clone().unwrap());
        let mut request = String::new();
        let mut length = 0;
        loop {
            let mut line = String::new();
            reader.read_line(&mut line).unwrap();
            request.push_str(&line);
            if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length: ") {
                length = value.trim().parse().unwrap();
            }
            if line == "\r\n" {
                break;
            }
        }
        let mut body = vec![0; length];
        reader.read_exact(&mut body).unwrap();
        request.push_str(&String::from_utf8(body).unwrap());
        sender.send(request).unwrap();
        write!(stream, "{response}").unwrap();
    });
    let api = RenameApi::new(
        url,
        Credentials {
            username: "synthetic-user".into(),
            password: "synthetic-password".into(),
        },
        "Q:\\folder & space",
    )
    .unwrap();
    (api, receiver, worker)
}

#[test]
fn patch_authenticates_and_encodes_directory_and_title() {
    let (api, requests, worker) =
        fake("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}");
    let result: serde_json::Value = api
        .request(
            Method::PATCH,
            "/session/ses_test",
            Some("中文 \"quote\" & title"),
        )
        .unwrap();
    assert_eq!(result, serde_json::json!({}));
    let request = requests.recv().unwrap();
    assert!(
        request.starts_with("PATCH /session/ses_test?directory=Q%3A%5Cfolder+%26+space HTTP/1.1")
    );
    assert!(request.contains(&format!(
        "authorization: Basic {}",
        STANDARD.encode("synthetic-user:synthetic-password")
    )));
    let body: serde_json::Value =
        serde_json::from_str(request.split_once("\r\n\r\n").unwrap().1).unwrap();
    assert_eq!(body, serde_json::json!({"title": "中文 \"quote\" & title"}));
    worker.join().unwrap();
}

#[test]
fn redirects_are_rejected_without_following_or_leaking_credentials() {
    let (api, _requests, worker) = fake(
        "HTTP/1.1 302 Found\r\nLocation: http://192.0.2.1/\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
    );
    let result: Result<serde_json::Value> =
        api.request(Method::PATCH, "/session/ses_test", Some("title"));
    assert!(result.unwrap_err().to_string().contains("302"));
    worker.join().unwrap();
}

#[test]
fn authentication_failure_is_reported_without_response_body() {
    let (api, _requests, worker) =
        fake("HTTP/1.1 401 Unauthorized\r\nContent-Length: 6\r\nConnection: close\r\n\r\nsecret");
    let result: Result<serde_json::Value> = api.request(Method::GET, "/path", None);
    let error = result.unwrap_err().to_string();
    assert!(error.contains("401"));
    assert!(!error.contains("secret"));
    worker.join().unwrap();
}

#[test]
fn startup_endpoint_rejects_non_loopback_and_injected_urls() {
    for url in [
        "http://localhost:1234",
        "http://0.0.0.0:1234",
        "https://127.0.0.1:1234",
        "http://127.0.0.1:1234/evil",
        "http://user:pass@127.0.0.1:1234",
        "http://127.0.0.1:1234/?x=1",
    ] {
        assert!(parse_endpoint(&format!("opencode server listening on {url}")).is_err());
    }
    assert!(parse_endpoint("opencode server listening on http://127.0.0.1:12345\n").is_ok());
}

#[test]
fn v2_startup_accepts_exact_server_prefix_without_relaxing_endpoint_boundaries() {
    assert!(parse_endpoint("server listening on http://127.0.0.1:56583\n").is_ok());
    for endpoint in [
        "http://localhost:1234",
        "http://0.0.0.0:1234",
        "https://127.0.0.1:1234",
        "http://127.0.0.1:1234/evil",
        "http://user:pass@127.0.0.1:1234",
        "http://127.0.0.1:1234/?x=1",
        "http://127.0.0.1:1234/#fragment",
        "http://127.0.0.1",
    ] {
        assert!(parse_endpoint(&format!("server listening on {endpoint}")).is_err());
    }
    for prefix in [
        "listening on ",
        "untrusted server listening on ",
        "server listening on: ",
    ] {
        assert!(parse_endpoint(&format!("{prefix}http://127.0.0.1:56583")).is_err());
    }
}

#[test]
fn update_requires_the_requested_session_and_title_in_official_response() {
    let body = r#"{"id":"ses_other","projectID":"global","directory":"Q:/test","title":"title","time":{"created":1}}"#;
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let (api, _requests, worker) = fake(response);
    assert!(api.update("ses_test", "title").is_err());
    worker.join().unwrap();
}

#[test]
fn update_accepts_official_project_id_field_and_unicode_title() {
    let body = r#"{"id":"ses_test","projectID":"global","directory":"Q:/test","title":"改名","time":{"created":1}}"#;
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let (api, _requests, worker) = fake(response);
    assert!(api.update("ses_test", "改名").is_ok());
    worker.join().unwrap();
}

#[test]
fn v2_patch_accepts_no_content_and_uses_api_route_and_fixed_username() {
    let (mut api, requests, worker) = fake("HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n");
    api.v2 = true;
    api.credentials.username = "opencode".into();
    api.update("ses_test", "改名").unwrap();
    let request = requests.recv().unwrap();
    assert!(request.starts_with("PATCH /api/session/ses_test?location%5Bdirectory%5D="));
    assert!(request.contains(&STANDARD.encode("opencode:synthetic-password")));
    worker.join().unwrap();
}

#[test]
fn v2_get_verifies_envelope_location_and_all_session_identity_fields() {
    let temp = tempfile::tempdir().unwrap();
    let database = temp.path().join("sessions.db");
    let connection = rusqlite::Connection::open(&database).unwrap();
    connection
        .execute_batch(include_str!("../tests/schema.sql"))
        .unwrap();
    connection
        .execute(
            "UPDATE session SET directory=?1, title='' WHERE id='ses_a'",
            [temp.path().to_str().unwrap()],
        )
        .unwrap();
    let repo = crate::repository::Repository::new(database, "2.2.5".into());
    let session = repo.session("ses_a").unwrap();
    let valid = serde_json::json!({"data": {
        "id": session.id, "projectID": session.project_id,
        "location": {"directory": session.directory},
        "time": {"created": session.created_at}
    }});
    for field in ["valid", "id", "projectID", "location", "time", "malformed"] {
        let mut body = valid.clone();
        match field {
            "id" => body["data"]["id"] = "ses_other".into(),
            "projectID" => body["data"]["projectID"] = "other".into(),
            "location" => {
                body["data"]["location"] =
                    serde_json::json!({"directory": temp.path().join("missing")})
            }
            "time" => body["data"]["time"]["created"] = 0.into(),
            "malformed" => body = serde_json::json!({"data": null}),
            _ => {}
        }
        let body = body.to_string();
        let (mut api, requests, worker) = fake(format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        ));
        api.v2 = true;
        api.directory = session.directory.clone();
        assert_eq!(
            api.verify_session(&session).is_ok(),
            field == "valid",
            "{field}"
        );
        assert!(
            requests
                .recv()
                .unwrap()
                .starts_with("GET /api/session/ses_a?location%5Bdirectory%5D=")
        );
        worker.join().unwrap();
    }
}

#[test]
fn v2_update_rejects_non_204_and_error_statuses() {
    for status in [
        "200 OK",
        "401 Unauthorized",
        "404 Not Found",
        "500 Internal Server Error",
    ] {
        let (mut api, _requests, worker) = fake(format!(
            "HTTP/1.1 {status}\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{}}"
        ));
        api.v2 = true;
        assert!(api.update("ses_test", "title").is_err());
        worker.join().unwrap();
    }
}
