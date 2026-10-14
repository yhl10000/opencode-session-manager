use crate::{
    dto::SessionSummary,
    error::{BackendError, Result},
    rename_process::Credentials,
};
use reqwest::{Method, blocking::Client, redirect::Policy};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use std::{
    net::{IpAddr, Ipv4Addr},
    path::Path,
    time::Duration,
};

#[cfg(test)]
#[path = "rename_api_tests.rs"]
mod tests;

pub(crate) struct RenameApi {
    client: Client,
    base: reqwest::Url,
    credentials: Credentials,
    directory: String,
}

#[derive(Deserialize)]
struct ApiTime {
    created: i64,
}

#[derive(Deserialize)]
struct ApiSession {
    id: String,
    #[serde(rename = "projectID")]
    project_id: String,
    directory: String,
    title: String,
    time: ApiTime,
}

#[derive(Deserialize)]
struct ApiPath {
    directory: String,
}

#[derive(Serialize)]
struct UpdateTitle<'a> {
    title: &'a str,
}

pub(crate) fn parse_endpoint(line: &str) -> Result<reqwest::Url> {
    let url = line
        .trim()
        .strip_prefix("opencode server listening on ")
        .and_then(|text| reqwest::Url::parse(text).ok())
        .ok_or_else(|| BackendError::Rename("Unexpected OpenCode server startup output".into()))?;
    if url.scheme() != "http"
        || url.host_str() != Some("127.0.0.1")
        || url.port().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(BackendError::Rename(
            "Server did not bind an ephemeral IPv4 loopback endpoint".into(),
        ));
    }
    Ok(url)
}

impl RenameApi {
    pub fn new(base: reqwest::Url, credentials: Credentials, directory: &str) -> Result<Self> {
        let client = Client::builder()
            .no_proxy()
            .redirect(Policy::none())
            .connect_timeout(Duration::from_secs(2))
            .timeout(Duration::from_secs(10))
            .local_address(IpAddr::V4(Ipv4Addr::LOCALHOST))
            .build()
            .map_err(|_| BackendError::Rename("Cannot initialize loopback HTTP client".into()))?;
        Ok(Self {
            client,
            base,
            credentials,
            directory: directory.into(),
        })
    }

    fn request<T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        title: Option<&str>,
    ) -> Result<T> {
        let mut url = self
            .base
            .join(path)
            .map_err(|_| BackendError::Rename("Invalid API path".into()))?;
        url.query_pairs_mut()
            .append_pair("directory", &self.directory);
        let mut request = self
            .client
            .request(method, url)
            .basic_auth(&self.credentials.username, Some(&self.credentials.password));
        if let Some(title) = title {
            request = request.json(&UpdateTitle { title });
        }
        let response = request.send().map_err(|_| {
            BackendError::Rename(
                "Loopback API request failed or timed out; refresh before retrying".into(),
            )
        })?;
        if !response.status().is_success() {
            return Err(BackendError::Rename(format!(
                "Loopback API returned HTTP {}",
                response.status().as_u16()
            )));
        }
        let bytes = std::io::Read::take(response, 65537);
        serde_json::from_reader(bytes)
            .map_err(|_| BackendError::Rename("Invalid or oversized loopback API response".into()))
    }

    pub fn verify_session(&self, session: &SessionSummary) -> Result<()> {
        let path: ApiPath = self.request(Method::GET, "/path", None)?;
        if Path::new(&path.directory).canonicalize()?
            != Path::new(&session.directory).canonicalize()?
        {
            return Err(BackendError::Rename(
                "Server project directory differs from selected session".into(),
            ));
        }
        let remote: ApiSession =
            self.request(Method::GET, &format!("/session/{}", session.id), None)?;
        if remote.id != session.id
            || remote.project_id != session.project_id
            || Path::new(&remote.directory).canonicalize()?
                != Path::new(&session.directory).canonicalize()?
            || remote.time.created != session.created_at
            || remote.title != session.title
        {
            return Err(BackendError::Rename(
                "Server session differs from catalog; refresh before renaming".into(),
            ));
        }
        Ok(())
    }

    pub fn update(&self, id: &str, title: &str) -> Result<()> {
        let remote: ApiSession =
            self.request(Method::PATCH, &format!("/session/{id}"), Some(title))?;
        if remote.id != id || remote.title != title {
            return Err(BackendError::Rename(
                "OpenCode did not acknowledge the requested title; refresh before retrying".into(),
            ));
        }
        Ok(())
    }
}
