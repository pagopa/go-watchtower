import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { S3Client, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import type { SqsSender, SqsSendInput } from "./dispatcher.js";
import {
  type SsmParameterReader,
  TransientSsmError,
  ParameterNotFoundError,
} from "./queue-registry.js";
import type { CatalogObjectReader } from "./capability-catalog.js";

/**
 * Adapter AWS concreti per i port `SqsSender`/`SsmParameterReader` (OPUS-03 §9.8).
 * I client sono creati per-regione (WT non esegue fallback cross-region) e
 * cacheati. La factory del client è iniettabile per i test (nessun accesso reale
 * ad AWS richiesto per testare il mapping).
 *
 * ⚠️ Non testato contro AWS reale in questa sessione (nessuna credenziale): la
 * logica di costruzione comando e mapping errori è unit-testata con client fake.
 */

export type SqsClientFactory = (region: string) => SQSClient;
export type SsmClientFactory = (region: string) => SSMClient;

export class AwsSqsSender implements SqsSender {
  private readonly clients = new Map<string, SQSClient>();

  constructor(
    private readonly clientFactory: SqsClientFactory = (region) => new SQSClient({ region }),
  ) {}

  private clientFor(region: string): SQSClient {
    let client = this.clients.get(region);
    if (client === undefined) {
      client = this.clientFactory(region);
      this.clients.set(region, client);
    }
    return client;
  }

  async send(input: SqsSendInput): Promise<{ messageId: string }> {
    const client = this.clientFor(input.region);
    const out = await client.send(
      new SendMessageCommand({
        QueueUrl: input.queueUrl,
        MessageBody: input.messageBody,
        MessageGroupId: input.messageGroupId,
        MessageDeduplicationId: input.messageDeduplicationId,
      }),
    );
    if (out.MessageId === undefined) {
      throw new Error("SQS SendMessage returned no MessageId");
    }
    return { messageId: out.MessageId };
  }
}

/** Errore AWS SDK v3 con metadati HTTP (duck-typing per il mapping transient). */
interface AwsLikeError {
  readonly name?: string;
  readonly $metadata?: { readonly httpStatusCode?: number };
  readonly code?: string;
}

const TRANSIENT_ERROR_NAMES = new Set([
  "ThrottlingException",
  "TooManyUpdates",
  "InternalServerError",
  "RequestTimeout",
  "TimeoutError",
  "RequestThrottled",
  "ServiceUnavailable",
]);

const TRANSIENT_ERROR_CODES = new Set(["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EPIPE", "ENOTFOUND"]);

/**
 * Mappa un errore SSM: ParameterNotFound → ParameterNotFoundError (INVALID);
 * throttling/5xx/timeout/rete → TransientSsmError (PENDING_DISPATCH + retry);
 * altro → ripropagato.
 */
export function mapSsmError(err: unknown): never {
  const e = err as AwsLikeError;
  if (e.name === "ParameterNotFound") {
    throw new ParameterNotFoundError("SSM parameter not found");
  }
  const status = e.$metadata?.httpStatusCode;
  const isTransient =
    (e.name !== undefined && TRANSIENT_ERROR_NAMES.has(e.name)) ||
    (e.code !== undefined && TRANSIENT_ERROR_CODES.has(e.code)) ||
    (status !== undefined && status >= 500);
  if (isTransient) {
    throw new TransientSsmError(`Transient SSM error: ${e.name ?? e.code ?? `HTTP ${String(status)}`}`, {
      cause: err,
    });
  }
  throw err instanceof Error ? err : new Error(String(err));
}

export class AwsSsmParameterReader implements SsmParameterReader {
  private readonly clients = new Map<string, SSMClient>();

  constructor(
    private readonly clientFactory: SsmClientFactory = (region) => new SSMClient({ region }),
  ) {}

  private clientFor(region: string): SSMClient {
    let client = this.clients.get(region);
    if (client === undefined) {
      client = this.clientFactory(region);
      this.clients.set(region, client);
    }
    return client;
  }

  async read(parameterName: string, region: string): Promise<string> {
    try {
      const out = await this.clientFor(region).send(
        new GetParameterCommand({ Name: parameterName, WithDecryption: false }),
      );
      const value = out.Parameter?.Value;
      if (value === undefined) {
        throw new ParameterNotFoundError(`SSM parameter ${parameterName} has no value`);
      }
      return value;
    } catch (err) {
      if (err instanceof ParameterNotFoundError) throw err;
      return mapSsmError(err);
    }
  }
}

export class AwsS3CatalogReader implements CatalogObjectReader {
  constructor(private readonly client: S3Client) {}

  async head(bucket: string, key: string) {
    const result = await this.client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { versionId: result.VersionId ?? null, etag: result.ETag ?? null };
  }

  async get(bucket: string, key: string, versionId: string | null) {
    const result = await this.client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(versionId ? { VersionId: versionId } : {}),
    }));
    if (!result.Body) throw new Error("CATALOG_EMPTY_BODY");
    const body = await result.Body.transformToByteArray();
    return { body, versionId: result.VersionId ?? versionId, etag: result.ETag ?? null };
  }
}

export function createAwsS3CatalogReader(region: string): AwsS3CatalogReader {
  // Timeout espliciti: una GET appesa bloccherebbe l'overlap guard del runner
  // e con esso tutti i tick successivi del sync. Il catalogo è ≤1MB same-region:
  // questi margini sono abbondanti e restano dentro l'intervallo di sync (60s).
  return new AwsS3CatalogReader(new S3Client({
    region,
    requestHandler: { connectionTimeout: 2_000, requestTimeout: 10_000 },
  }));
}
