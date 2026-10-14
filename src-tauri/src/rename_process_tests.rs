use super::*;

fn powershell(script: &str) -> Command {
    let mut command = Command::new(crate::discovery::executable("pwsh").unwrap());
    command.args(["-NoProfile", "-Command", script]);
    command
}

#[test]
fn output_is_drained_without_deadlock_when_child_is_verbose() {
    let mut command = powershell(
        "[Console]::Error.Write(('e' * 1000000)); [Console]::Out.Write(('x' * 1000000))",
    );
    let result = OwnedProcess::start(&mut command).unwrap().capture();
    assert!(result.unwrap_err().to_string().contains("too large"));
}

#[test]
fn owned_server_is_terminated_when_guard_is_dropped_after_error() {
    let mut command =
        powershell("[Console]::Out.WriteLine('not an endpoint'); Start-Sleep -Seconds 120");
    let mut child = OwnedProcess::start(&mut command).unwrap();
    let pid = child.child.id();
    let result = crate::rename_api::parse_endpoint(&child.first_line().unwrap());
    assert!(result.is_err());
    drop(child);
    let mut check = powershell(&format!(
        "if (Get-Process -Id {pid} -ErrorAction SilentlyContinue) {{ exit 1 }}"
    ));
    assert!(check.status().unwrap().success());
}

#[test]
fn successful_startup_does_not_block_on_further_stdout() {
    let mut command = powershell(
        "[Console]::Out.WriteLine('ready'); [Console]::Out.Write(('x' * 1000000)); Start-Sleep -Seconds 120",
    );
    let mut child = OwnedProcess::start(&mut command).unwrap();
    assert_eq!(child.first_line().unwrap().trim(), "ready");
    child.stop().unwrap();
    assert!(child.child.try_wait().unwrap().is_some());
}

#[test]
fn credentials_are_random_with_256_bit_passwords() {
    let first = Credentials::random().unwrap();
    let second = Credentials::random().unwrap();
    assert_ne!(first.username, second.username);
    assert_ne!(first.password, second.password);
    assert_eq!(URL_SAFE_NO_PAD.decode(first.password).unwrap().len(), 32);
}

#[test]
fn startup_timeout_still_allows_owned_child_cleanup() {
    let mut command = powershell("Start-Sleep -Seconds 120");
    let mut child = OwnedProcess::start(&mut command).unwrap();
    let error = child.first_line_with_timeout(Duration::ZERO).unwrap_err();
    assert!(error.to_string().contains("timed out"));
    child.stop().unwrap();
    assert!(child.child.try_wait().unwrap().is_some());
}

#[test]
fn shutdown_drains_only_after_owned_server_is_killed_and_reaped() {
    use crate::mutation::{ExitDecision, MutationLifecycle};
    use std::sync::Arc;
    let lifecycle = Arc::new(MutationLifecycle::default());
    let worker_lifecycle = Arc::clone(&lifecycle);
    let (started, active) = mpsc::channel();
    let (release, resume) = mpsc::channel();
    let worker = thread::spawn(move || {
        worker_lifecycle.execute(|| {
            let mut command =
                powershell("[Console]::Out.WriteLine('ready'); Start-Sleep -Seconds 120");
            let mut server = OwnedProcess::start(&mut command)?;
            server.first_line()?;
            started.send(server.child.id()).unwrap();
            resume.recv().unwrap();
            Ok(())
        })
    });
    let pid = active.recv().unwrap();

    assert_eq!(lifecycle.request_shutdown().unwrap(), ExitDecision::Drain);
    release.send(()).unwrap();
    lifecycle.wait_drained().unwrap();

    let mut check = powershell(&format!(
        "if (Get-Process -Id {pid} -ErrorAction SilentlyContinue) {{ exit 1 }}"
    ));
    assert!(check.status().unwrap().success());
    assert_eq!(lifecycle.request_shutdown().unwrap(), ExitDecision::Exit);
    worker.join().unwrap().unwrap();
}
