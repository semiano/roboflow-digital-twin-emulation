export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  event: string;
  payload: Record<string, unknown> | undefined;
  /** Wall-clock ISO timestamp. Log timestamps are real time by design. */
  timestamp: string;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const RING_CAPACITY = 500;

class Logger {
  private minimumLevel: LogLevel = 'info';
  private readonly ring: LogEntry[] = [];

  setLevel(level: LogLevel): void {
    this.minimumLevel = level;
  }

  debug(event: string, payload?: Record<string, unknown>): void {
    this.write('debug', event, payload);
  }

  info(event: string, payload?: Record<string, unknown>): void {
    this.write('info', event, payload);
  }

  warn(event: string, payload?: Record<string, unknown>): void {
    this.write('warn', event, payload);
  }

  error(event: string, payload?: Record<string, unknown>): void {
    this.write('error', event, payload);
  }

  /** Most recent entries, oldest first. Backs the HMI event log. */
  recent(count = RING_CAPACITY): readonly LogEntry[] {
    return this.ring.slice(-count);
  }

  private write(level: LogLevel, event: string, payload?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minimumLevel]) return;

    const entry: LogEntry = { level, event, payload, timestamp: new Date().toISOString() };

    this.ring.push(entry);
    if (this.ring.length > RING_CAPACITY) this.ring.shift();

    const method = level === 'debug' ? 'log' : level;
    console[method](`[${event}]`, payload ?? '');
  }
}

export const logger = new Logger();
