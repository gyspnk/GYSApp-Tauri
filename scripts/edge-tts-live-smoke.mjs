import crypto from "node:crypto";
import https from "node:https";

const { synthesizeEdgeDirect } = await import(
  new URL("../apps/web/src/edge-direct.ts", import.meta.url)
);

const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const CONNECT_TIMEOUT_MS = 10_000;

function clientFrame(opcode, value = Buffer.alloc(0)) {
  const payload = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const mask = crypto.randomBytes(4);
  let header;
  if (payload.length <= 125) {
    header = Buffer.alloc(2);
    header[1] = 0x80 | payload.length;
  } else if (payload.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  header[0] = 0x80 | opcode;

  const masked = Buffer.alloc(payload.length);
  for (let index = 0; index < payload.length; index += 1) {
    masked[index] = payload[index] ^ mask[index % 4];
  }
  return Buffer.concat([header, mask, masked]);
}

class NativeLikeSocket {
  #socket;
  #listeners = new Set();
  #buffer = Buffer.alloc(0);
  #fragmentOpcode;
  #fragmentParts = [];
  #closed = false;

  constructor(socket, head) {
    this.#socket = socket;
    socket.on("data", (chunk) => this.#consume(chunk));
    socket.on("close", () => this.#emitClose("socket closed"));
    socket.on("error", (error) => this.#emitClose(error.message));
    if (head?.length) this.#consume(head);
  }

  addListener(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async send(message) {
    const isText = typeof message === "string";
    const payload = isText ? Buffer.from(message, "utf8") : Buffer.from(message);
    await new Promise((resolve, reject) => {
      this.#socket.write(clientFrame(isText ? 0x1 : 0x2, payload), (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  async disconnect() {
    if (this.#closed) return;
    this.#closed = true;
    try {
      this.#socket.write(clientFrame(0x8));
    } finally {
      this.#socket.destroy();
    }
  }

  #emit(message) {
    for (const listener of this.#listeners) listener(message);
  }

  #emitClose(reason) {
    if (this.#closed) return;
    this.#closed = true;
    this.#emit({ type: "Close", data: reason });
  }

  #consume(chunk) {
    this.#buffer = Buffer.concat([this.#buffer, Buffer.from(chunk)]);
    while (this.#buffer.length >= 2) {
      const first = this.#buffer[0];
      const second = this.#buffer[1];
      const fin = Boolean(first & 0x80);
      const opcode = first & 0x0f;
      const masked = Boolean(second & 0x80);
      let payloadLength = second & 0x7f;
      let offset = 2;

      if (payloadLength === 126) {
        if (this.#buffer.length < offset + 2) return;
        payloadLength = this.#buffer.readUInt16BE(offset);
        offset += 2;
      } else if (payloadLength === 127) {
        if (this.#buffer.length < offset + 8) return;
        const bigLength = this.#buffer.readBigUInt64BE(offset);
        if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new Error("WebSocket frame is too large");
        }
        payloadLength = Number(bigLength);
        offset += 8;
      }

      let mask;
      if (masked) {
        if (this.#buffer.length < offset + 4) return;
        mask = this.#buffer.subarray(offset, offset + 4);
        offset += 4;
      }
      if (this.#buffer.length < offset + payloadLength) return;

      let payload = this.#buffer.subarray(offset, offset + payloadLength);
      this.#buffer = this.#buffer.subarray(offset + payloadLength);
      if (mask) {
        payload = Buffer.from(payload);
        for (let index = 0; index < payload.length; index += 1) {
          payload[index] ^= mask[index % 4];
        }
      }

      if (opcode === 0x8) {
        this.#emitClose("server closed connection");
        this.#socket.destroy();
        continue;
      }
      if (opcode === 0x9) {
        this.#socket.write(clientFrame(0x0a, payload));
        this.#emit({ type: "Ping", data: Array.from(payload) });
        continue;
      }
      if (opcode === 0x0a) {
        this.#emit({ type: "Pong", data: Array.from(payload) });
        continue;
      }

      if (opcode === 0x0) {
        if (this.#fragmentOpcode === undefined) continue;
        this.#fragmentParts.push(Buffer.from(payload));
        if (fin) {
          const complete = Buffer.concat(this.#fragmentParts);
          const originalOpcode = this.#fragmentOpcode;
          this.#fragmentOpcode = undefined;
          this.#fragmentParts = [];
          this.#emitData(originalOpcode, complete);
        }
        continue;
      }

      if (!fin) {
        this.#fragmentOpcode = opcode;
        this.#fragmentParts = [Buffer.from(payload)];
        continue;
      }
      this.#emitData(opcode, payload);
    }
  }

  #emitData(opcode, payload) {
    if (opcode === 0x1) {
      this.#emit({ type: "Text", data: payload.toString("utf8") });
    } else if (opcode === 0x2) {
      this.#emit({ type: "Binary", data: Array.from(payload) });
    }
  }
}

async function connect(urlString, config = {}) {
  const url = new URL(urlString);
  const websocketKey = crypto.randomBytes(16).toString("base64");
  const expectedAccept = crypto
    .createHash("sha1")
    .update(`${websocketKey}${WEBSOCKET_GUID}`)
    .digest("base64");

  return await new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const timeout = setTimeout(
      () => fail(new Error("Edge WebSocket handshake timed out")),
      CONNECT_TIMEOUT_MS,
    );
    const request = https.request({
      protocol: "https:",
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers: {
        ...config.headers,
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Key": websocketKey,
        "Sec-WebSocket-Version": "13",
      },
    });

    request.once("upgrade", (response, socket, head) => {
      if (settled) {
        socket.destroy();
        return;
      }
      const accept = response.headers["sec-websocket-accept"];
      if (response.statusCode !== 101 || accept !== expectedAccept) {
        socket.destroy();
        fail(
          new Error(
            `Edge WebSocket handshake rejected (${response.statusCode ?? "unknown"})`,
          ),
        );
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve(new NativeLikeSocket(socket, head));
    });
    request.once("response", (response) => {
      response.resume();
      fail(
        new Error(
          `Edge WebSocket handshake returned HTTP ${response.statusCode ?? "unknown"}`,
        ),
      );
    });
    request.once("error", fail);
    request.end();
  });
}

const startedAt = Date.now();
const blob = await synthesizeEdgeDirect(
  {
    text: "Tuhan Yesus memberkati.",
    voice: "id-ID-GadisNeural",
    rate: 1,
    pitch: 1,
    volume: 1,
  },
  { connect },
);
const bytes = Buffer.from(await blob.arrayBuffer());
if (blob.type !== "audio/mpeg") {
  throw new Error(`Unexpected Edge audio type: ${blob.type || "empty"}`);
}
if (bytes.length < 512) {
  throw new Error(`Edge TTS returned too little audio (${bytes.length} bytes)`);
}
console.log(
  `Edge keyless TTS live smoke passed: ${bytes.length} audio bytes in ${Date.now() - startedAt}ms`,
);
