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
