use crate::error::{BackendError, Result};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use std::{
    io::{BufRead, BufReader, Read},
    path::Path,
    process::{Child, Command, Stdio},
    sync::mpsc,
    thread::{self, JoinHandle},
    time::Duration,
};
use wait_timeout::ChildExt;

#[cfg(test)]
#[path = "rename_process_tests.rs"]
mod tests;

pub(crate) struct Credentials {
    pub username: String,
    pub password: String,
}

impl Credentials {
    pub fn random() -> Result<Self> {
        let mut bytes = [0_u8; 48];
        getrandom::fill(&mut bytes)
            .map_err(|_| BackendError::Rename("Secure random credentials unavailable".into()))?;
        Ok(Self {
            username: URL_SAFE_NO_PAD.encode(&bytes[..16]),
            password: URL_SAFE_NO_PAD.encode(&bytes[16..]),
        })
    }
}

pub(crate) struct OwnedProcess {
    child: Child,
    reader: Option<JoinHandle<()>>,
}

impl OwnedProcess {
    pub fn start(command: &mut Command) -> Result<Self> {
        command
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000);
        }
        Ok(Self {
            child: command.spawn()?,
            reader: None,
        })
    }

    pub fn first_line(&mut self) -> Result<String> {
        self.first_line_with_timeout(Duration::from_secs(30))
    }

    fn first_line_with_timeout(&mut self, timeout: Duration) -> Result<String> {
        let stdout = self
            .child
            .stdout
            .take()
            .ok_or_else(|| BackendError::Rename("Missing server output".into()))?;
        let (sender, receiver) = mpsc::sync_channel(1);
        self.reader = Some(thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            let mut line = String::new();
            let result = reader
                .by_ref()
                .take(1024)
                .read_line(&mut line)
                .map(|_| line);
            drop(sender.send(result));
            drop(std::io::copy(&mut reader, &mut std::io::sink()));
        }));
        receiver
            .recv_timeout(timeout)
            .map_err(|_| BackendError::Rename("Server startup timed out (30 seconds)".into()))?
            .map_err(BackendError::Io)
    }

    pub fn capture(mut self) -> Result<String> {
        let stdout = self
            .child
            .stdout
            .take()
            .ok_or_else(|| BackendError::Rename("Missing command output".into()))?;
        let (sender, receiver) = mpsc::sync_channel(1);
        self.reader = Some(thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            let mut text = String::new();
            let result = reader
                .by_ref()
                .take(65537)
                .read_to_string(&mut text)
                .map(|_| text);
            drop(sender.send(result));
            drop(std::io::copy(&mut reader, &mut std::io::sink()));
        }));
        let status = self
            .child
            .wait_timeout(Duration::from_secs(15))?
            .ok_or_else(|| {
                BackendError::Rename("Database discovery timed out (15 seconds)".into())
            })?;
        if !status.success() {
            return Err(BackendError::Rename(
                "Database discovery command failed".into(),
            ));
        }
        let text = receiver
            .recv_timeout(Duration::from_secs(1))
            .map_err(|_| BackendError::Rename("Database discovery output timed out".into()))??;
        if text.len() > 65536 {
            return Err(BackendError::Rename(
                "Database discovery output too large".into(),
            ));
        }
        Ok(text.trim().into())
    }

    pub fn ensure_running(&mut self) -> Result<()> {
        if self.child.try_wait()?.is_some() {
            return Err(BackendError::Rename(
                "Owned OpenCode server exited unexpectedly".into(),
            ));
        }
        Ok(())
    }

    pub fn stop(&mut self) -> Result<()> {
        if self.child.try_wait()?.is_none() {
            self.child.kill()?;
        }
        self.child.wait()?;
        if let Some(reader) = self.reader.take() {
            reader
                .join()
                .map_err(|_| BackendError::Rename("Server output reader failed".into()))?;
        }
        Ok(())
    }
}

impl Drop for OwnedProcess {
    fn drop(&mut self) {
        if let Err(error) = self.stop() {
            eprintln!("OpenCode rename process cleanup failed: {error}");
        }
    }
}

pub(crate) fn command(program: &Path, directory: &Path) -> Command {
    let mut command = Command::new(program);
    command.current_dir(directory);
    command
}
