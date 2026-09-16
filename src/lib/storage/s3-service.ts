/**
 * Service de Mídia S3 / MinIO Parametrizável (On-Premises & Cloud)
 * Soberania AI - Governança de Mídia Institucional
 */

export interface S3Config {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  forcePathStyle: boolean;
}

export function getS3Config(): S3Config {
  return {
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    region: process.env.S3_REGION || 'us-east-1',
    accessKeyId: process.env.S3_ACCESS_KEY_ID || 'soberania_minio',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'soberania_secret_123',
    bucketName: process.env.S3_BUCKET_NAME || 'soberania-media-bucket',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  };
}

export interface PresignedUploadResponse {
  uploadUrl: string;
  fileUrl: string;
  s3ObjectKey: string;
}

/**
 * Gera URL de upload e chave de objeto para mídias pedagógicas de aula (MinIO/S3)
 */
export async function createPresignedUploadUrl(
  subjectCode: string,
  lessonNumber: number,
  fileName: string,
  contentType: string
): Promise<PresignedUploadResponse> {
  const config = getS3Config();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const timestamp = Date.now();
  const s3ObjectKey = `lessons/${subjectCode.toLowerCase()}/aula-${lessonNumber}/${timestamp}_${sanitizedFileName}`;

  // URL pública ou de proxy para acesso direto do browser
  const baseUrl = config.endpoint.endsWith('/') ? config.endpoint.slice(0, -1) : config.endpoint;
  const fileUrl = `${baseUrl}/${config.bucketName}/${s3ObjectKey}`;
  
  // URL de upload simulada/presigned local para o endpoint institucional
  const uploadUrl = `${baseUrl}/${config.bucketName}/${s3ObjectKey}?uploadToken=${timestamp}`;

  return {
    uploadUrl,
    fileUrl,
    s3ObjectKey,
  };
}
