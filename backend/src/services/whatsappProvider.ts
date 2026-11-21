import crypto from 'crypto';
import Redis from 'ioredis';
import { redisConnection } from '../config/redis';

export interface WhatsAppDeliveryMessage {
  idempotencyKey: string;
  recipient: string;
  certificateNumber: string;
  downloadUrl: string;
  verificationUrl: string;
}

export interface WhatsAppProvider {
  send(message: WhatsAppDeliveryMessage): Promise<{ providerMessageId: string }>;
}

export type SimulatedDeliveryOutcome = 'SUCCESS' | 'FAILURE' | 'TIMEOUT';

interface SimulatedWhatsAppProviderOptions {
  failureRate?: number;
  timeoutRate?: number;
  requestTimeoutMs?: number;
  latencyMs?: number;
  idempotencyPrefix?: string;
  outcomeFor?: (message: WhatsAppDeliveryMessage) => SimulatedDeliveryOutcome;
  redis?: Redis;
}

const readProbability = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : fallback;
};

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class SimulatedWhatsAppProvider implements WhatsAppProvider {
  private readonly failureRate: number;
  private readonly timeoutRate: number;
  private readonly requestTimeoutMs: number;
  private readonly latencyMs: number;
  private readonly idempotencyPrefix: string;
  private readonly outcomeFor?: SimulatedWhatsAppProviderOptions['outcomeFor'];
  private readonly redis: Redis;
  successfulDeliveryCount = 0;
  sendAttemptCount = 0;

  constructor(options: SimulatedWhatsAppProviderOptions = {}) {
    this.failureRate = options.failureRate ??
      readProbability(process.env.WHATSAPP_SIMULATED_FAILURE_RATE, 0.2);
    this.timeoutRate = options.timeoutRate ??
      readProbability(process.env.WHATSAPP_SIMULATED_TIMEOUT_RATE, 0.1);
    this.requestTimeoutMs = options.requestTimeoutMs ?? 2000;
    this.latencyMs = options.latencyMs ?? 150;
    this.idempotencyPrefix = options.idempotencyPrefix ?? 'whatsapp:simulated:delivered';
    this.outcomeFor = options.outcomeFor;
    this.redis = options.redis ?? redisConnection;
  }

  async send(message: WhatsAppDeliveryMessage): Promise<{ providerMessageId: string }> {
    const redisKey = `${this.idempotencyPrefix}:${message.idempotencyKey}`;
    const previousMessageId = await this.redis.get(redisKey);
    if (previousMessageId) {
      return { providerMessageId: previousMessageId };
    }

    this.sendAttemptCount += 1;
    const outcome = this.getOutcome(message);
    if (outcome === 'TIMEOUT') {
      await delay(this.requestTimeoutMs);
      throw new Error('Simulated WhatsApp provider request timed out.');
    }

    if (this.latencyMs > 0) {
      await delay(this.latencyMs);
    }
    if (outcome === 'FAILURE') {
      throw new Error('Simulated WhatsApp provider returned a transient failure.');
    }

    const providerMessageId = `sim-${crypto.randomUUID()}`;
    const saved = await this.redis.set(redisKey, providerMessageId, 'NX');
    if (saved === 'OK') {
      this.successfulDeliveryCount += 1;
      return { providerMessageId };
    }

    const deduplicatedMessageId = await this.redis.get(redisKey);
    if (!deduplicatedMessageId) {
      throw new Error('Simulated provider idempotency record could not be read.');
    }
    return { providerMessageId: deduplicatedMessageId };
  }

  private getOutcome(message: WhatsAppDeliveryMessage): SimulatedDeliveryOutcome {
    if (this.outcomeFor) {
      return this.outcomeFor(message);
    }

    const sample = Math.random();
    if (sample < this.failureRate) {
      return 'FAILURE';
    }
    if (sample < this.failureRate + this.timeoutRate) {
      return 'TIMEOUT';
    }
    return 'SUCCESS';
  }
}

export const simulatedWhatsAppProvider = new SimulatedWhatsAppProvider();
