import { useEffect, useState } from "react";
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
    const stop = (closePending = true) => {
      controller.abort();
      clearInterval(ticker);
      clearTimeout(timeout);
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
        try {
          messagingWindow.location.replace(
            `https://api.whatsapp.com/send?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(data.content)}`,
          );
          launched = true;
        } catch {
          fail("WhatsApp tidak dapat dibuka. Tekan WhatsApp lagi.");
          return;
        }
        setStatus("Menghubungkan WhatsApp");
        socket = new WebSocket(egysWhatsAppTrackingUrl());
        socket.onerror = () => fail("Koneksi terputus. Tekan WhatsApp lagi.");
        socket.onclose = () => {
          if (!confirming) fail("Sesi berakhir. Tekan WhatsApp lagi.");
        };
        socket.onmessage = (event) => {
          if (controller.signal.aborted) return;
          let message;
          try {
            message = JSON.parse(event.data);
          } catch {
            return;
          }
          if (message.type === "info" && !confirming) {
            setStatus("Menunggu pesan WhatsApp");
          }
          if (message.type === "error") {
            fail("Pesan belum dapat diverifikasi. Tekan WhatsApp lagi.");
            return;
          }
          if (
            message.refid === reference &&
            /^[0-9]{4,12}$/.test(String(message.otp ?? ""))
          )
            void confirm(String(message.otp), phone);
        };
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
