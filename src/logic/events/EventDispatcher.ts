export type EventMap = Record<string, unknown>;

export type EventListener<Events extends EventMap, K extends keyof Events> = (payload: Events[K]) => void;

export class EventDispatcher<Events extends EventMap> {
  private listeners: globalThis.Map<keyof Events, Set<EventListener<Events, keyof Events>>> = new Map();

  on<K extends keyof Events>(event: K, listener: EventListener<Events, K>): () => void {
    let bucket = this.listeners.get(event);
    if (!bucket) {
      bucket = new Set();
      this.listeners.set(event, bucket as Set<EventListener<Events, keyof Events>>);
    }
    (bucket as Set<EventListener<Events, K>>).add(listener);
    return () => this.off(event, listener);
  }

  once<K extends keyof Events>(event: K, listener: EventListener<Events, K>): () => void {
    const wrapped: EventListener<Events, K> = (payload) => {
      this.off(event, wrapped);
      listener(payload);
    };
    return this.on(event, wrapped);
  }

  off<K extends keyof Events>(event: K, listener: EventListener<Events, K>): void {
    const bucket = this.listeners.get(event);
    if (!bucket) {
      return;
    }
    (bucket as Set<EventListener<Events, K>>).delete(listener);
    if (bucket.size === 0) {
      this.listeners.delete(event);
    }
  }

  clear(): void {
    this.listeners.clear();
  }

  dispatch<K extends keyof Events>(event: K, payload: Events[K]): void {
    const bucket = this.listeners.get(event);
    if (!bucket) {
      return;
    }
    const listeners = Array.from(bucket) as EventListener<Events, K>[];
    for (const listener of listeners) {
      listener(payload);
    }
  }
}
