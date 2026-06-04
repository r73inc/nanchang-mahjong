/**
 * WsThrottle — per-socket per-event token bucket rate limiter.
 *
 * Each (socketId, eventName) pair gets a rolling window counter.
 * If the socket emits the event more than `limit` times within `windowMs`,
 * allow() returns false and the gateway drops the message + emits game:error.
 *
 * All state is in-memory; it is reset when clearSocket() is called on disconnect.
 */

interface BucketConfig {
  limit: number;
  windowMs: number;
}

interface Bucket {
  count: number;
  windowStart: number;
}

export class WsThrottle {
  /** Outer key: `${socketId}:${event}` */
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly config: Record<string, BucketConfig>) {}

  /**
   * Return true if the event is within the rate limit; false if throttled.
   * Side-effect: increments the bucket counter.
   */
  allow(socketId: string, event: string): boolean {
    const cfg = this.config[event];
    if (!cfg) return true; // unconfigured events always pass

    const key = `${socketId}:${event}`;
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket || now - bucket.windowStart >= cfg.windowMs) {
      bucket = { count: 0, windowStart: now };
    }

    bucket.count++;
    this.buckets.set(key, bucket);

    return bucket.count <= cfg.limit;
  }

  /** Remove all throttle state for a disconnecting socket. */
  clearSocket(socketId: string): void {
    const prefix = `${socketId}:`;
    for (const key of this.buckets.keys()) {
      if (key.startsWith(prefix)) this.buckets.delete(key);
    }
  }
}
