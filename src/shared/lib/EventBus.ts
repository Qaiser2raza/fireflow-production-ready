import { EventEmitter } from 'events';

export interface DomainEvent {
  eventId: string;
  eventType: string;
  restaurantId: string;
  aggregateType: string;
  aggregateId: string;
  payload: any;
  occurredAt: Date;
}

export class EventBus {
  private emitter: EventEmitter;
  private static instance: EventBus;

  private constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100);
  }

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  publish(event: DomainEvent): void {
    this.emitter.emit(event.eventType, event);
    this.emitter.emit('*', event);
  }

  subscribe(eventType: string, handler: (event: DomainEvent) => void): void {
    this.emitter.on(eventType, handler);
  }

  unsubscribe(eventType: string, handler: (event: DomainEvent) => void): void {
    this.emitter.off(eventType, handler);
  }
}
