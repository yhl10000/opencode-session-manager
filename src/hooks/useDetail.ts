import { useEffect, useState } from "react";
import { api, errorMessage } from "../lib/api";
import type { Resource, SessionDetail } from "../lib/types";

export function useDetail(sessionId: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    readonly id: string;
    readonly attempt: number;
    readonly state: Resource<SessionDetail>;
  } | null>(null);
  useEffect(() => {
    if (sessionId === null) return;
    let current = true;
    setResult({ id: sessionId, attempt, state: { status: "loading" } });
    api
      .getSessionDetail(sessionId)
      .then((data) => {
        if (current) setResult({ id: sessionId, attempt, state: { status: "ready", data } });
      })
      .catch((error: unknown) => {
        if (current)
          setResult({
            id: sessionId,
            attempt,
            state: { status: "error", error: errorMessage(error) },
          });
      });
    return () => {
      current = false;
    };
  }, [sessionId, attempt]);
  const state: Resource<SessionDetail> =
    result?.id === sessionId && result.attempt === attempt ? result.state : { status: "loading" };
  return { state, retry: () => setAttempt((value) => value + 1) };
}
