import fs from 'fs';
import path from 'path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

export type StoragePrefix = 'materials' | 'media';

const STORAGE_DIRS: Record<StoragePrefix, { env: string; fallback: string; bucketKey: string }> = {
  materials: { env: 'MATERIALS_STORAGE_DIR', fallback: './storage/materials', bucketKey: 'materials' },
  media: { env: 'MEDIA_STORAGE_DIR', fallback: './storage/media', bucketKey: 'media' },
};

export interface UploadResult {
  key: string;
  filePath: string;
  url?: string;
  provider: 'local' | 'r2';
}

export interface FileStreamResult {
  buffer: Buffer;
  contentType?: string;
  contentLength?: number;
}

export class StorageService {
  private s3Client: S3Client | null = null;

  constructor() {
    this.initS3Client();
  }

  private initS3Client(): void {
    const provider = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
    if (provider !== 'r2') {
      return;
    }

    const accountId = process.env.R2_ACCOUNT_ID || '';
    const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
    const customEndpoint = process.env.R2_ENDPOINT || '';

    const endpoint = customEndpoint || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');

    if (endpoint && accessKeyId && secretAccessKey) {
      this.s3Client = new S3Client({
        region: 'auto',
        endpoint,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    } else {
      console.warn('[StorageService] AVISO: STORAGE_PROVIDER="r2" foi especificado, mas credenciais de R2 estão incompletas. Utilizando fallback local.');
    }
  }

  public getProvider(): 'local' | 'r2' {
    const provider = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
    if (provider === 'r2' && (this.s3Client || this.canInitS3Client())) {
      if (!this.s3Client) {
        this.initS3Client();
      }
      return this.s3Client ? 'r2' : 'local';
    }
    return 'local';
  }

  private canInitS3Client(): boolean {
    const accountId = process.env.R2_ACCOUNT_ID || '';
    const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
    const customEndpoint = process.env.R2_ENDPOINT || '';
    return Boolean((customEndpoint || accountId) && accessKeyId && secretAccessKey);
  }

  /**
   * Uploads a file buffer to Cloudflare R2 or local filesystem
   */
  public async uploadFile(
    fileBuffer: Buffer,
    sanitizedFilename: string,
    mimeType: string,
    prefix: StoragePrefix = 'materials'
  ): Promise<UploadResult> {
    const target = STORAGE_DIRS[prefix];
    const activeProvider = this.getProvider();
    const uniqueFilename = `${Date.now()}-${sanitizedFilename}`;

    if (activeProvider === 'r2' && this.s3Client) {
      const bucketName = process.env.R2_BUCKET_NAME || 'soberania-materials';
      const key = `${target.bucketKey}/${uniqueFilename}`;

      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: fileBuffer,
          ContentType: mimeType,
        })
      );

      const publicDomain = process.env.R2_PUBLIC_DOMAIN || '';
      const url = publicDomain ? `${publicDomain.replace(/\/$/, '')}/${key}` : undefined;
      const filePath = `r2://${bucketName}/${key}`;

      return {
        key,
        filePath,
        url,
        provider: 'r2',
      };
    }

    // Fallback: Armazenamento no FileSystem Local
    const relativeDir = process.env[target.env] || target.fallback;
    const absoluteDir = path.resolve(process.cwd(), relativeDir);

    if (!fs.existsSync(absoluteDir)) {
      fs.mkdirSync(absoluteDir, { recursive: true });
    }

    const destinationPath = path.join(absoluteDir, uniqueFilename);
    await fs.promises.writeFile(destinationPath, fileBuffer);

    const filePath = path.join(relativeDir, uniqueFilename).replace(/\\/g, '/');

    return {
      key: uniqueFilename,
      filePath,
      provider: 'local',
    };
  }

  /**
   * Retrieves a file buffer from Cloudflare R2 or local filesystem
   */
  public async getFileBuffer(filePathOrKey: string): Promise<FileStreamResult> {
    const isR2Path = filePathOrKey.startsWith('r2://') || (this.getProvider() === 'r2' && !filePathOrKey.startsWith('.'));

    if (isR2Path && this.s3Client) {
      const bucketName = process.env.R2_BUCKET_NAME || 'soberania-materials';
      const key = filePathOrKey.replace(/^r2:\/\/[^/]+\//, '');

      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      if (!response.Body) {
        throw new Error(`Objeto não encontrado no R2 para a chave: ${key}`);
      }

      const byteArray = await response.Body.transformToByteArray();
      const buffer = Buffer.from(byteArray);

      return {
        buffer,
        contentType: response.ContentType,
        contentLength: response.ContentLength,
      };
    }

    // Leitura Local no FileSystem
    const normalizedPath = filePathOrKey.replace(/^r2:\/\/[^/]+\//, '');
    const absolutePath = path.isAbsolute(normalizedPath)
      ? normalizedPath
      : path.resolve(process.cwd(), normalizedPath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Arquivo não encontrado no disco local: ${absolutePath}`);
    }

    const buffer = await fs.promises.readFile(absolutePath);
    return {
      buffer,
      contentLength: buffer.length,
    };
  }

  /**
   * Deletes a file from Cloudflare R2 or local filesystem
   */
  public async deleteFile(filePathOrKey: string): Promise<void> {
    const isR2Path = filePathOrKey.startsWith('r2://') || (this.getProvider() === 'r2' && !filePathOrKey.startsWith('.'));

    if (isR2Path && this.s3Client) {
      const bucketName = process.env.R2_BUCKET_NAME || 'soberania-materials';
      const key = filePathOrKey.replace(/^r2:\/\/[^/]+\//, '');

      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: bucketName,
          Key: key,
        })
      );
      return;
    }

    // Remoção Local no FileSystem
    const normalizedPath = filePathOrKey.replace(/^r2:\/\/[^/]+\//, '');
    const absolutePath = path.isAbsolute(normalizedPath)
      ? normalizedPath
      : path.resolve(process.cwd(), normalizedPath);

    if (fs.existsSync(absolutePath)) {
      await fs.promises.unlink(absolutePath).catch(() => {});
    }
  }
}

export const storageService = new StorageService();
