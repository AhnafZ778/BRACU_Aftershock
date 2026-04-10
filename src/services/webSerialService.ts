/**
 * webSerialService.ts — Browser Web Serial API bridge for LoRa Hardware Gateway
 * ===============================================================================
 * Allows the frontend to communicate with a locally-plugged ESP32 Gateway
 * directly from the browser, bypassing the backend pyserial entirely.
 *
 * This is critical for cloud-hosted backends (Render, Railway, etc.) where the
 * server has no physical USB ports.  The Web Serial API is Chromium-only
 * (Chrome ≥89, Edge ≥89, Opera ≥75).
 *
 * NRP Wire Protocol (same as backend lora_hardware.py):
 *   TX → ESP32:  NRP|<NODE_ID>|<MSG_TYPE>|<PAYLOAD>|<MSG_ID>\n
 *   RX ← ESP32:  ACK|<MSG_ID>|RSSI:<value>\n
 */

// ─────────────────────────────────────────────────────────────────────────────
// Type augmentation for the Web Serial API (not in default TS lib)
// ─────────────────────────────────────────────────────────────────────────────

interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

interface SerialOptions {
  baudRate: number;
  dataBits?: number;
  stopBits?: number;
  parity?: 'none' | 'even' | 'odd';
  bufferSize?: number;
  flowControl?: 'none' | 'hardware';
}

interface WebSerialPort {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  getInfo(): SerialPortInfo;
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
}

declare global {
  interface Navigator {
    serial?: {
      requestPort(options?: { filters?: Array<{ usbVendorId?: number; usbProductId?: number }> }): Promise<WebSerialPort>;
      getPorts(): Promise<WebSerialPort[]>;
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Types shared with useHardwareStore
// ─────────────────────────────────────────────────────────────────────────────

export interface WebSerialLogEntry {
  id: string;
  timestamp: string;
  direction: 'tx' | 'ack' | 'rx' | 'system';
  text: string;
  level: 'transmit' | 'ack' | 'rx' | 'info' | 'error' | 'system';
  msg_id?: string;
  node_id?: string;
  msg_type?: string;
  extra?: string;
}

export interface WebSerialStatus {
  connected: boolean;
  port: string | null;
  baud: number;
  packets_sent: number;
  last_ack: string | null;
  last_ack_ts: string | null;
  serial_lib: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const NRP_PREFIX = 'NRP';
const MAX_PAYLOAD_CHARS = 80;
const LOG_BUFFER_SIZE = 100;

function nowISO(): string {
  return new Date().toISOString();
}

function hexId(): string {
  return Math.random().toString(16).slice(2, 6).toUpperCase();
}

// Known ESP32 USB-UART chip vendor IDs for auto-filtering the port picker
const ESP32_FILTERS = [
  { usbVendorId: 0x10C4 }, // Silicon Labs CP210x
  { usbVendorId: 0x1A86 }, // CH340 / CH341
  { usbVendorId: 0x0403 }, // FTDI FT232
  { usbVendorId: 0x303A }, // Espressif native USB
];

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Service
// ─────────────────────────────────────────────────────────────────────────────

class WebSerialService {
  private port: WebSerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readLoopActive = false;

  // Public observable state
  connected = false;
  portLabel: string | null = null;
  baud = 115200;
  packetsSent = 0;
  lastAck: string | null = null;
  lastAckTs: string | null = null;

  log: WebSerialLogEntry[] = [];

  // Callback for external state sync (useHardwareStore will attach this)
  onChange: (() => void) | null = null;

  // ── Feature detection ──────────────────────────────────────────────────────

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.serial;
  }

  // ── Request port (requires user gesture) ───────────────────────────────────

  async requestPort(): Promise<boolean> {
    if (!navigator.serial) return false;
    try {
      // Show the browser's native port picker with ESP32 filters
      // Fall back to showing ALL ports if the filters match nothing
      try {
        this.port = await navigator.serial.requestPort({ filters: ESP32_FILTERS });
      } catch {
        this.port = await navigator.serial.requestPort();
      }

      const info = this.port.getInfo();
      this.portLabel = info.usbVendorId
        ? `USB (VID:${info.usbVendorId.toString(16).toUpperCase()} PID:${(info.usbProductId ?? 0).toString(16).toUpperCase()})`
        : 'Serial Port';

      this._logEvent('system', `Port selected: ${this.portLabel}`, 'info');
      this._notify();
      return true;
    } catch (err) {
      // User cancelled the port picker dialog
      if (err instanceof DOMException && err.name === 'NotFoundError') {
        return false;
      }
      this._logEvent('system', `Port request failed: ${err}`, 'error');
      this._notify();
      return false;
    }
  }

  // ── Connect ────────────────────────────────────────────────────────────────

  async connect(baud = 115200): Promise<void> {
    if (!this.port) throw new Error('No port selected. Click "Select USB Port" first.');
    if (this.connected) throw new Error('Already connected. Disconnect first.');

    await this.port.open({ baudRate: baud, bufferSize: 4096 });
    this.baud = baud;
    this.connected = true;

    // Open writer
    if (this.port.writable) {
      this.writer = this.port.writable.getWriter();
    }

    // Start background read loop
    this._startReadLoop();

    this._logEvent('system', `Connected @ ${baud} baud`, 'info');
    this._notify();
  }

  // ── Disconnect ─────────────────────────────────────────────────────────────

  async disconnect(): Promise<void> {
    // Send DISCONNECT command to ESP32 (best effort)
    try {
      if (this.writer) {
        const msgId = hexId();
        const line = `${NRP_PREFIX}|ALL|DISCONNECT||${msgId}\n`;
        await this.writer.write(new TextEncoder().encode(line));
      }
    } catch { /* ignore */ }

    // Stop reader
    this.readLoopActive = false;
    try { this.reader?.cancel(); } catch { /* ignore */ }
    try { this.reader?.releaseLock(); } catch { /* ignore */ }
    this.reader = null;

    // Release writer
    try { this.writer?.releaseLock(); } catch { /* ignore */ }
    this.writer = null;

    // Close port
    try { await this.port?.close(); } catch { /* ignore */ }

    const oldLabel = this.portLabel;
    this.connected = false;
    // Keep port reference so user can reconnect without re-selecting
    this._logEvent('system', `Disconnected from ${oldLabel}`, 'info');
    this._notify();
  }

  // ── Transmit NRP packet ────────────────────────────────────────────────────

  async transmit(nodeId: string, msgType: string, payload: string): Promise<string> {
    if (!this.connected || !this.writer) {
      throw new Error('Not connected to any serial port.');
    }

    const truncated = payload.slice(0, MAX_PAYLOAD_CHARS);
    const msgId = hexId();
    const line = `${NRP_PREFIX}|${nodeId}|${msgType}|${truncated}|${msgId}\n`;

    await this.writer.write(new TextEncoder().encode(line));
    this.packetsSent++;

    this._logEvent('tx', line.trim(), 'transmit', msgId, nodeId, msgType);
    this._notify();
    return msgId;
  }

  // ── Get current status ─────────────────────────────────────────────────────

  getStatus(): WebSerialStatus {
    return {
      connected: this.connected,
      port: this.portLabel,
      baud: this.baud,
      packets_sent: this.packetsSent,
      last_ack: this.lastAck,
      last_ack_ts: this.lastAckTs,
      serial_lib: true,
    };
  }

  // ── Get log entries ────────────────────────────────────────────────────────

  getLog(): WebSerialLogEntry[] {
    return [...this.log];
  }

  // ── Check if a port has been selected ──────────────────────────────────────

  hasPort(): boolean {
    return this.port !== null;
  }

  // ── Reset (clear port selection) ───────────────────────────────────────────

  reset(): void {
    this.port = null;
    this.portLabel = null;
    this.connected = false;
    this.packetsSent = 0;
    this.lastAck = null;
    this.lastAckTs = null;
    this.log = [];
    this._notify();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private
  // ═══════════════════════════════════════════════════════════════════════════

  private _startReadLoop(): void {
    if (!this.port?.readable) return;
    this.readLoopActive = true;
    this.reader = this.port.readable.getReader();

    const decoder = new TextDecoder();
    let buffer = '';

    const loop = async () => {
      try {
        while (this.readLoopActive && this.reader) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (!value) continue;

          buffer += decoder.decode(value, { stream: true });

          // Process complete lines
          let nlIdx: number;
          while ((nlIdx = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, nlIdx).trim();
            buffer = buffer.slice(nlIdx + 1);
            if (line) this._parseIncoming(line);
          }
        }
      } catch (err) {
        if (this.readLoopActive) {
          this._logEvent('system', `Serial read error: ${err}`, 'error');
          this.connected = false;
          this._notify();
        }
      }
    };

    loop();
  }

  private _parseIncoming(line: string): void {
    if (line.startsWith('ACK|')) {
      const parts = line.split('|');
      const msgId = parts[1] ?? '???';
      const rssi = parts[2] ?? 'RSSI:?';
      this.lastAck = msgId;
      this.lastAckTs = nowISO();
      this._logEvent('ack', line, 'ack', msgId, undefined, undefined, rssi);
    } else {
      this._logEvent('rx', line, 'info');
    }
    this._notify();
  }

  private _logEvent(
    direction: 'tx' | 'ack' | 'rx' | 'system',
    text: string,
    level: WebSerialLogEntry['level'],
    msgId?: string,
    nodeId?: string,
    msgType?: string,
    extra?: string,
  ): void {
    const entry: WebSerialLogEntry = {
      id: hexId() + hexId(),
      timestamp: nowISO(),
      direction,
      text,
      level,
    };
    if (msgId) entry.msg_id = msgId;
    if (nodeId) entry.node_id = nodeId;
    if (msgType) entry.msg_type = msgType;
    if (extra) entry.extra = extra;

    this.log.unshift(entry); // newest first
    if (this.log.length > LOG_BUFFER_SIZE) {
      this.log = this.log.slice(0, LOG_BUFFER_SIZE);
    }
  }

  private _notify(): void {
    this.onChange?.();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton export
// ─────────────────────────────────────────────────────────────────────────────

export const webSerial = new WebSerialService();
export default webSerial;
