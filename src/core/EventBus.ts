import type { EventOfType, SystemEvent, SystemEventType } from './events';

type Handler<T extends SystemEventType> = (event: EventOfType<T>) => void;
type AnyHandler = (event: SystemEvent) => void;

export interface Unsubscribe {
  (): void;
}

/**
 * Synchronous typed pub/sub. Handler errors are contained so one bad subscriber
 * cannot stall the simulation tick.
 */
export class EventBus {
  private readonly handlers = new Map<SystemEventType, Set<AnyHandler>>();
  private readonly wildcardHandlers = new Set<AnyHandler>();

  on<T extends SystemEventType>(type: T, handler: Handler<T>): Unsubscribe {
    const set = this.handlers.get(type) ?? new Set<AnyHandler>();
    set.add(handler as AnyHandler);
    this.handlers.set(type, set);
    return () => {
      set.delete(handler as AnyHandler);
    };
  }

  onAny(handler: AnyHandler): Unsubscribe {
    this.wildcardHandlers.add(handler);
    return () => {
      this.wildcardHandlers.delete(handler);
    };
  }

  emit(event: SystemEvent): void {
    const typed = this.handlers.get(event.type);
    if (typed) {
      for (const handler of [...typed]) this.invoke(handler, event);
    }
    for (const handler of [...this.wildcardHandlers]) this.invoke(handler, event);
  }

  clear(): void {
    this.handlers.clear();
    this.wildcardHandlers.clear();
  }

  private invoke(handler: AnyHandler, event: SystemEvent): void {
    try {
      handler(event);
    } catch (error) {
      this.onHandlerError?.(event, error);
    }
  }

  /** Assigned by the composition root so contained errors are still surfaced. */
  onHandlerError?: (event: SystemEvent, error: unknown) => void;
}
