use crate::error::{BackendError, Result};
use std::sync::{Condvar, Mutex};

#[derive(Debug, Default)]
pub struct MutationLifecycle {
    state: Mutex<MutationState>,
    changed: Condvar,
}

#[derive(Debug, Default)]
struct MutationState {
    closing: bool,
    active: bool,
}

struct ActiveMutation<'a>(&'a MutationLifecycle);

impl Drop for ActiveMutation<'_> {
    fn drop(&mut self) {
        let mut state = self
            .0
            .state
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        state.active = false;
        self.0.changed.notify_all();
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum ExitDecision {
    Exit,
    Drain,
    Wait,
}

impl MutationLifecycle {
    pub fn execute<T>(&self, work: impl FnOnce() -> Result<T>) -> Result<T> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| BackendError::MutationUnavailable)?;
        while state.active && !state.closing {
            state = self
                .changed
                .wait(state)
                .map_err(|_| BackendError::MutationUnavailable)?;
        }
        if state.closing {
            return Err(BackendError::ShuttingDown);
        }
        state.active = true;
        drop(state);
        let _active = ActiveMutation(self);
        work()
    }

    pub fn request_shutdown(&self) -> Result<ExitDecision> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| BackendError::MutationUnavailable)?;
        let already_closing = state.closing;
        state.closing = true;
        self.changed.notify_all();
        if !state.active {
            Ok(ExitDecision::Exit)
        } else if already_closing {
            Ok(ExitDecision::Wait)
        } else {
            Ok(ExitDecision::Drain)
        }
    }

    pub fn wait_drained(&self) -> Result<()> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| BackendError::MutationUnavailable)?;
        while state.active {
            state = self
                .changed
                .wait(state)
                .map_err(|_| BackendError::MutationUnavailable)?;
        }
        Ok(())
    }
}

#[cfg(test)]
#[path = "mutation_tests.rs"]
mod tests;
