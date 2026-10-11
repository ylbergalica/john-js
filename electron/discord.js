// Discord Rich Presence over Discord's local IPC pipe, so friends see "Playing Starspite".
// No library: a frame is an 8-byte header (opcode, JSON length, both int32 LE) and the JSON.
// If Discord isn't running (or closes) it quietly retries, and resends the last activity.
import { connect } from 'node:net';
import { join } from 'node:path';

const CLIENT_ID = '1558818418444992612';
const RETRY_MS = 15000;
const Op = { Handshake: 0, Frame: 1, Close: 2, Ping: 3, Pong: 4 };

const pipePath = (i) => process.platform === 'win32'
  ? `\\\\?\\pipe\\discord-ipc-${i}`
  : join(process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || '/tmp', `discord-ipc-${i}`);

function encode(op, data) {
  const json = Buffer.from(JSON.stringify(data));
  const header = Buffer.alloc(8);
  header.writeInt32LE(op, 0);
  header.writeInt32LE(json.length, 4);
  return Buffer.concat([header, json]);
}

let socket = null;
let ready = false;
let activity = null;
let retryTimer = null;
let nonce = 0;
let stopped = false;

function send(op, data) { socket?.write(encode(op, data)); }

function pushActivity() {
  if (!ready) return;
  send(Op.Frame, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity }, nonce: String(++nonce) });
}

function scheduleRetry() {
  ready = false;
  socket = null;
  if (!stopped && !retryTimer) retryTimer = setTimeout(() => { retryTimer = null; tryPipe(0); }, RETRY_MS);
}

// Discord listens on the first free of discord-ipc-0..9; try each in turn.
function tryPipe(i) {
  if (stopped) return;
  if (i > 9) { scheduleRetry(); return; }
  const s = connect(pipePath(i));
  let buffer = Buffer.alloc(0);
  s.once('connect', () => {
    socket = s;
    send(Op.Handshake, { v: 1, client_id: CLIENT_ID });
  });
  s.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 8) {
      const op = buffer.readInt32LE(0), len = buffer.readInt32LE(4);
      if (buffer.length < 8 + len) break;
      let msg = null;
      try { msg = JSON.parse(buffer.subarray(8, 8 + len).toString()); } catch { /* malformed: skip */ }
      buffer = buffer.subarray(8 + len);
      if (op === Op.Ping) send(Op.Pong, msg);
      else if (op === Op.Close) s.destroy();
      else if (op === Op.Frame && msg?.evt === 'READY') { ready = true; pushActivity(); }
    }
  });
  s.on('error', () => {
    s.destroy();
    if (socket !== s) tryPipe(i + 1); // never connected: try the next pipe
  });
  s.on('close', () => { if (socket === s) scheduleRetry(); });
}

export const discord = {
  start() { tryPipe(0); },
  // `next` is a Discord activity ({ details, state, timestamps }), or null to clear it.
  setActivity(next) {
    activity = next;
    pushActivity();
  },
  stop() {
    stopped = true;
    clearTimeout(retryTimer);
    socket?.destroy();
  },
};
