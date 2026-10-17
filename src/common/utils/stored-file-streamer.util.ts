import {
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { createReadStream } from 'fs';
import { readFile } from 'fs/promises';
import { Readable } from 'stream';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

/**
 * Fetches a stored file's bytes and pipes them into `res`, dispatching on
 * how `storageKey` was produced by UploadService (@weblaud/upload-pro):
 *
 *   - S3 (`*.amazonaws.com/...`): fetched directly via the AWS SDK with this
 *     server's own credentials — upload-pro exposes upload and delete but no
 *     read/download method, so this bypasses it rather than going through a
 *     public object URL. No signed link of any lifetime is ever generated;
 *     the browser never sees anything but the caller's own authenticated
 *     endpoint.
 *   - Any other http(s) URL (Cloudinary, or any future provider): proxied
 *     with a plain server-side fetch. Weaker than the S3 path — if the
 *     provider's URL is itself guessable/public this doesn't add
 *     confidentiality, only removes the link from ever reaching the browser
 *     — but it's what's available without that provider's SDK.
 *   - Anything else: treated as a local filesystem path (what LocalService's
 *     `key`/`location` actually is).
 *
 * Extracted from ContractService (see its streamDocument), which needed this
 * exact dispatch first — FileService (project files, Phase 7) reuses it
 * rather than a second copy of the same S3/local/remote logic. `label` only
 * changes the wording of thrown errors ("Contract document" vs "File"), so
 * each caller's messages still read naturally.
 */
export async function streamStoredFile(
  storageKey: string,
  res: NodeJS.WritableStream,
  config: ConfigService,
  logger: Logger,
  label: string,
): Promise<void> {
  if (storageKey.includes('amazonaws.com')) {
    await pipeFromS3(storageKey, res, config, logger, label);
    return;
  }

  if (/^https?:\/\//.test(storageKey)) {
    await pipeFromRemoteUrl(storageKey, res, label);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const read = createReadStream(storageKey);
    read.on('error', (err) => {
      logger.error(
        `Failed to read ${label.toLowerCase()} from disk: ${storageKey}`,
        err.stack,
      );
      reject(new NotFoundException(`${label} could not be read`));
    });
    read.on('end', resolve);
    read.pipe(res as NodeJS.WritableStream & { end: () => void });
  });
}

async function pipeFromS3(
  url: string,
  res: NodeJS.WritableStream,
  config: ConfigService,
  logger: Logger,
  label: string,
): Promise<void> {
  const key = url.split('.com/')[1];
  if (!key) throw new NotFoundException(`${label} could not be located`);

  const { client, bucket } = s3ClientFromConfig(config);
  try {
    const object = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const body = object.Body;
    if (!body) throw new NotFoundException(`${label} not found in storage`);
    await new Promise<void>((resolve, reject) => {
      (body as Readable)
        .pipe(res as NodeJS.WritableStream & { end: () => void })
        .on('finish', resolve)
        .on('error', reject);
    });
  } catch (err) {
    if (err instanceof NotFoundException) throw err;
    logger.error(
      `Failed to fetch ${label.toLowerCase()} from S3: ${key}`,
      err instanceof Error ? err.stack : String(err),
    );
    throw new NotFoundException(`${label} not found in storage`);
  }
}

/**
 * Same storage dispatch as streamStoredFile, but hands back the whole file as
 * a Buffer instead of piping it — for small files whose response headers
 * depend on the bytes themselves (CVs: legacy records have no stored MIME type,
 * so it has to be sniffed from the file's first bytes before any header goes
 * out). Don't use it for large files; stream those with streamStoredFile.
 */
export async function readStoredFile(
  storageKey: string,
  config: ConfigService,
  logger: Logger,
  label: string,
): Promise<Buffer> {
  try {
    if (storageKey.includes('amazonaws.com')) {
      const key = storageKey.split('.com/')[1];
      if (!key) throw new NotFoundException(`${label} could not be located`);
      const { client, bucket } = s3ClientFromConfig(config);
      const object = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      if (!object.Body) {
        throw new NotFoundException(`${label} not found in storage`);
      }
      return Buffer.from(await object.Body.transformToByteArray());
    }

    if (/^https?:\/\//.test(storageKey)) {
      const upstream = await fetch(storageKey);
      if (!upstream.ok) {
        throw new NotFoundException(`${label} not found in storage`);
      }
      return Buffer.from(await upstream.arrayBuffer());
    }

    return await readFile(storageKey);
  } catch (err) {
    if (
      err instanceof NotFoundException ||
      err instanceof InternalServerErrorException
    ) {
      throw err;
    }
    logger.error(
      `Failed to read ${label.toLowerCase()}: ${storageKey}`,
      err instanceof Error ? err.stack : String(err),
    );
    throw new NotFoundException(`${label} could not be read`);
  }
}

function s3ClientFromConfig(config: ConfigService): {
  client: S3Client;
  bucket: string;
} {
  const region = config.get<string>('AWS_REGION');
  const bucket = config.get<string>('AWS_S3_BUCKET');
  const accessKeyId = config.get<string>('AWS_ACCESS_KEY_ID');
  const secretAccessKey = config.get<string>('AWS_SECRET_ACCESS_KEY');
  if (!region || !bucket || !accessKeyId || !secretAccessKey) {
    throw new InternalServerErrorException(
      'S3 is not configured — cannot fetch the stored file',
    );
  }
  return {
    client: new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucket,
  };
}

async function pipeFromRemoteUrl(
  url: string,
  res: NodeJS.WritableStream,
  label: string,
): Promise<void> {
  const upstream = await fetch(url);
  if (!upstream.ok || !upstream.body) {
    throw new NotFoundException(`${label} not found in storage`);
  }
  await new Promise<void>((resolve, reject) => {
    Readable.fromWeb(upstream.body as import('stream/web').ReadableStream)
      .pipe(res as NodeJS.WritableStream & { end: () => void })
      .on('finish', resolve)
      .on('error', reject);
  });
}
