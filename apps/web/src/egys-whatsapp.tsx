import { useEffect, useState } from "react";
import { recordDiagnostic } from "./diagnostics.js";
import { requestEgysProvider, egysWhatsAppTrackingUrl } from "./egys.js";

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
  messagingWindow,
}: {
  onComplete: (signal: AbortSignal) => Promise<void>;
  onCancel: () => void;
  messagingWindow: Window | null;
}) {
  const [seconds, setSeconds] = useState(LOGIN_TIMEOUT_MS / 1000);
  const [status, setStatus] = useState("Menyiapkan WhatsApp");
  const [error, setError] = useState("");
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
          current.onclose = () => {
            if (controller.signal.aborted || confirming || socket !== current)
              return;
            recordDiagnostic(
              "warn",
              "egys.whatsapp.tracking",
              new Error(`Tracking disconnected (${current.readyState})`),
            );
            setStatus("Menghubungkan kembali WhatsApp");
            reconnect = window.setTimeout(
              connect,
              Math.min(5000, 1000 * 2 ** retries++),
            );
          };
          current.onmessage = (event) => {
            if (controller.signal.aborted || socket !== current) return;
            let message;
            try {
              message = JSON.parse(event.data);
            } catch {
              return;
            }
            if (!message || typeof message !== "object") return;
            if (message.type === "info" && !confirming)
              setStatus("Menunggu pesan WhatsApp");
            if (message.type === "error") {
              fail("Pesan belum dapat diverifikasi. Tekan WhatsApp lagi.");
              return;
            }
            // The challenge phone belongs to the bot. Confirmation requires
            // the sender's phone reported by the official tracking channel.
            const sender = message.mobilePhone ?? message.mobilephone;
            if (
              message.refid === reference &&
              /^[0-9]{4,12}$/.test(String(message.otp ?? "")) &&
              typeof sender === "string" &&
              /^\+?[0-9]{6,20}$/.test(sender)
            )
              void confirm(String(message.otp), sender);
          };
        };
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
