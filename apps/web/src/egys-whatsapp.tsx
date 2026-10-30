import { useEffect, useRef, useState } from "react";
import { recordDiagnostic } from "./diagnostics.js";
import { requestEgysProvider, egysWhatsAppTrackingUrl } from "./egys.js";
import {
  describeTrackingGap,
  parseWhatsAppTrackingEvent,
} from "./egys-whatsapp-tracking.js";

type Challenge = {
  referenceid?: string;
  referenceId?: string;
  mobilephone?: string;
  mobilePhone?: string;
  content: string;
};
const LOGIN_TIMEOUT_MS = 120_000;

/** Lives inside the provider button; clicking that button starts a fresh attempt. */
export function EgysWhatsApp({
  onComplete,
  onCancel,
  onExpire,
  messagingWindow,
}: {
  onComplete: (signal: AbortSignal) => Promise<void>;
  onCancel: () => void;
  /** The deadline passed without a tracking confirmation. */
  onExpire?: () => void;
  messagingWindow: Window | null;
}) {
  const [seconds, setSeconds] = useState(LOGIN_TIMEOUT_MS / 1000);
  const [status, setStatus] = useState("Menyiapkan WhatsApp");
  const [error, setError] = useState("");
  // Keep the expiry callback off the attempt's dependency list: a fresh closure
  // from the parent would otherwise restart the socket and reset the deadline.
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);
  useEffect(() => {
    const controller = new AbortController();
    const deadline = Date.now() + LOGIN_TIMEOUT_MS;
    let socket: WebSocket | undefined;
    let launched = false;
    let confirming = false;
    let reconnect = 0;
    let retries = 0;
    const stop = (closePending = true) => {
      controller.abort();
      clearInterval(ticker);
      clearTimeout(timeout);
      clearTimeout(reconnect);
      socket?.close();
      if (closePending && !launched) messagingWindow?.close();
    };
    const ticker = window.setInterval(() => {
      setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    }, 1000);
    const timeout = window.setTimeout(() => {
      // The badge disappears either way, but the account panel keeps an
      // explanation: a silent expiry reads as "nothing happened".
      if (!controller.signal.aborted) {
        recordDiagnostic(
          "warn",
          "egys.whatsapp.timeout",
          new Error("No tracking confirmation before the deadline"),
        );
        onExpireRef.current?.();
      }
      stop();
      onCancel();
    }, LOGIN_TIMEOUT_MS);
    const fail = (message: string) => {
      if (controller.signal.aborted) return;
      recordDiagnostic("warn", "egys.whatsapp", new Error(message));
      setError(message);
      stop();
    };
    if (!messagingWindow || messagingWindow.closed) {
      fail("Izinkan tab WhatsApp dibuka, lalu tekan WhatsApp lagi.");
      return () => stop(false);
    }
    const confirm = async (code: string, mobilephone: string) => {
      if (confirming || controller.signal.aborted) return;
      confirming = true;
      setStatus("Memverifikasi akun");
      try {
        await requestEgysProvider(
          "whatsapp/confirm",
          { otp: code, mobilephone },
          controller.signal,
        );
        if (!controller.signal.aborted) await onComplete(controller.signal);
      } catch (err) {
        fail(err instanceof Error ? err.message : "Login belum berhasil");
      }
    };
    void requestEgysProvider<Challenge>("whatsapp/start", {}, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        const reference = data.referenceid ?? data.referenceId;
        const phone = data.mobilephone ?? data.mobilePhone;
        if (!reference || !phone || !data.content) {
          fail("Respons WhatsApp tidak valid. Tekan WhatsApp lagi.");
          return;
        }
        if (messagingWindow.closed) {
          fail("Tab ditutup. Tekan WhatsApp lagi.");
          return;
        }
        recordDiagnostic(
          "info",
          "egys.whatsapp.start",
          new Error(`Prepared reference ${reference}`),
        );
        const launchWhatsApp = () => {
          if (launched || controller.signal.aborted) return;
          try {
            messagingWindow.location.replace(
              `https://api.whatsapp.com/send?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(data.content)}`,
            );
            launched = true;
          } catch {
            fail("WhatsApp tidak dapat dibuka. Tekan WhatsApp lagi.");
            return;
          }
        };
        const connect = () => {
          if (controller.signal.aborted || confirming) return;
          clearTimeout(reconnect);
          setStatus("Menghubungkan WhatsApp");
          const current = new WebSocket(egysWhatsAppTrackingUrl());
          socket = current;
          current.onopen = () => {
            if (controller.signal.aborted || socket !== current) return;
            retries = 0;
            // Subscribe first so a quickly sent message cannot beat tracking.
            launchWhatsApp();
            setStatus("Menunggu pesan WhatsApp");
          };
          current.onerror = () => {
            if (current.readyState < WebSocket.CLOSING) current.close();
          };
          current.onclose = (event) => {
            if (controller.signal.aborted || confirming || socket !== current)
              return;
            recordDiagnostic(
              "warn",
              "egys.whatsapp.tracking",
              new Error(
                `Tracking disconnected (code=${event.code}${event.reason ? ` reason=${event.reason}` : ""})`,
              ),
            );
            setStatus("Menghubungkan kembali WhatsApp");
            reconnect = window.setTimeout(
              connect,
              Math.min(5000, 1000 * 2 ** retries++),
            );
          };
          current.onmessage = (event) => {
            if (controller.signal.aborted || socket !== current) return;
            let payload: unknown;
            try {
              payload = JSON.parse(event.data);
            } catch {
              return;
            }
            const parsed = parseWhatsAppTrackingEvent(payload, reference);
            if (!parsed) {
              // A matching reference whose payload cannot authorise a session
              // is the one failure mode nobody can see from the UI; record
              // which fields were missing so support has a concrete cause.
              const gap = describeTrackingGap(payload, reference);
              if (gap)
                recordDiagnostic(
                  "warn",
                  "egys.whatsapp.tracking.event",
                  new Error(gap),
                );
              return;
            }
            if (parsed.type === "info") {
              if (!confirming) setStatus("Menunggu pesan WhatsApp");
              return;
            }
            if (parsed.type === "incomplete") return;
            if (parsed.type === "error") {
              recordDiagnostic(
                "warn",
                "egys.whatsapp.tracking.error",
                new Error(parsed.message || "Tracking error frame"),
              );
              fail("Pesan belum dapat diverifikasi. Tekan WhatsApp lagi.");
              return;
            }
            recordDiagnostic(
              "info",
              "egys.whatsapp.tracking.confirm",
              new Error("Confirmation event received"),
            );
            // The challenge phone belongs to the bot. Confirmation requires
            // the sender's phone reported by the official tracking channel.
            void confirm(parsed.otp, parsed.senderPhone);
          };
        };
        // Open WhatsApp in the same tick as the challenge. Tracking is a
        // best-effort side channel: gating the tab behind a WebSocket `open`
        // left every user without a socket (blocked upgrade, stale session,
        // retry backoff) staring at a countdown that never opened WhatsApp.
        launchWhatsApp();
        connect();
      })
      .catch((err) =>
        fail(err instanceof Error ? err.message : "WhatsApp tidak tersedia"),
      );
    return () => stop(false);
  }, [onComplete, onCancel, messagingWindow]);
  return (
    <span
      className={`egys-whatsapp-countdown${error ? " is-error" : ""}`}
      role={error ? "alert" : "timer"}
      aria-label={error || `${status}, ${seconds} detik tersisa`}
      title={error || `${status} · tekan lagi untuk memulai ulang`}
    >
      {error
        ? "!"
        : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
    </span>
  );
}
