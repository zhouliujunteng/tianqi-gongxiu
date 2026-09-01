import { md5FileBase64 } from './fileMd5';

type ImagePresignedResult = {
  imageId: string | number;
  uploadUrl: string;
  uploadHeaders: Record<string, string> | null;
};

function normalizeUploadHeaders(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(headers as Record<string, unknown>).map(([key, value]) => [
      key,
      String(value ?? ''),
    ])
  );
}

function getFileSuffix(file: File): string {
  const ext = file.name.split('.').pop()?.trim().toLowerCase() ?? '';
  if (ext === 'jpg' || ext === 'jpeg') return 'JPG';
  if (ext === 'png') return 'PNG';
  if (ext === 'gif') return 'GIF';
  if (ext === 'webp') return 'WEBP';
  if (ext === 'svg') return 'SVG';

  const mime = file.type.toLowerCase();
  if (mime === 'image/jpeg') return 'JPG';
  if (mime === 'image/png') return 'PNG';
  if (mime === 'image/gif') return 'GIF';
  if (mime === 'image/webp') return 'WEBP';
  if (mime === 'image/svg+xml') return 'SVG';
  return 'OTHER';
}

export async function uploadImageViaZion(
  file: File,
  getUploadUrl: (variables: {
    md5: string;
    suffix: string;
    acl: string;
  }) => Promise<ImagePresignedResult>
): Promise<string> {
  const md5 = await md5FileBase64(file);
  const result = await getUploadUrl({
    md5,
    suffix: getFileSuffix(file),
    acl: 'PRIVATE',
  });

  const uploadRes = await fetch(result.uploadUrl, {
    method: 'PUT',
    headers: normalizeUploadHeaders(result.uploadHeaders),
    body: file,
  });

  if (!uploadRes.ok) {
    throw new Error(`截图上传失败（${uploadRes.status}）`);
  }

  return String(result.imageId);
}
