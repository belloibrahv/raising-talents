import {
  IMAGE_CONTENT_TYPES,
  IMAGE_MAX_BYTES,
  VIDEO_CONTENT_TYPES,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_SECONDS,
  type MediaAsset,
  type MediaPurpose,
  type UploadIntentResponse,
} from '@rt/contracts';
import { t } from '../../i18n';
import { isApiError, NetworkError } from '../api/api-error';
import { api } from '../api/client';
import { prepareImage } from './prepare-image';
import { videoDurationSeconds } from './video-duration';

export const ACCEPT_IMAGES = IMAGE_CONTENT_TYPES.join(',');
export const ACCEPT_MEDIA = [...IMAGE_CONTENT_TYPES, ...VIDEO_CONTENT_TYPES].join(',');

/** A problem with the chosen file, found before anything is sent. The message is ready to show. */
export class FileProblem extends Error {}

type ImageType = (typeof IMAGE_CONTENT_TYPES)[number];
type VideoType = (typeof VIDEO_CONTENT_TYPES)[number];

const isImage = (type: string): type is ImageType =>
  (IMAGE_CONTENT_TYPES as readonly string[]).includes(type);
const isVideo = (type: string): type is VideoType =>
  (VIDEO_CONTENT_TYPES as readonly string[]).includes(type);

/** Checks the file against the same limits the API enforces, and shrinks photos. */
export async function prepareForUpload(
  file: File,
  options: { videoAllowed: boolean },
): Promise<File> {
  if (isVideo(file.type)) {
    if (!options.videoAllowed) throw new FileProblem(t('media.photoOnly'));
    if (file.size > VIDEO_MAX_BYTES) throw new FileProblem(t('media.videoTooLarge'));
    const seconds = await videoDurationSeconds(file);
    if (seconds !== null && seconds > VIDEO_MAX_SECONDS) {
      throw new FileProblem(t('media.videoTooLong', { seconds: Math.round(seconds) }));
    }
    return file;
  }
  if (!isImage(file.type)) {
    throw new FileProblem(options.videoAllowed ? t('media.typeNotAllowed') : t('media.photoOnly'));
  }
  const prepared = await prepareImage(file);
  if (prepared.size > IMAGE_MAX_BYTES) throw new FileProblem(t('media.imageTooLarge'));
  return prepared;
}

/**
 * Sends the file where the intent says, with progress. XMLHttpRequest rather than fetch,
 * because fetch cannot report upload progress, and a 200 MB clip needs a progress bar.
 */
function send(
  upload: UploadIntentResponse['upload'],
  file: File,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(upload.method, upload.url);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new FileProblem(t('media.uploadFailed')));
    };
    request.onerror = () => {
      reject(new NetworkError(new Error('Upload failed')));
    };
    request.onabort = () => {
      reject(new DOMException('Upload cancelled', 'AbortError'));
    };
    signal?.addEventListener('abort', () => {
      request.abort();
    });
    if (upload.method === 'PUT') {
      request.setRequestHeader('content-type', file.type);
      request.send(file);
    } else {
      // A presigned POST: every policy field first, the file last.
      const form = new FormData();
      for (const [name, value] of Object.entries(upload.fields)) form.append(name, value);
      form.append('file', file);
      request.send(form);
    }
  });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Uploads one prepared file: intent, transfer, then confirmation. Video may take the
 * provider a moment to register after the transfer, so confirmation is retried briefly.
 */
export async function uploadMedia(input: {
  purpose: MediaPurpose;
  file: File;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<MediaAsset> {
  const { file } = input;
  const intent = await api.call('media.createUploadIntent', {
    body: {
      purpose: input.purpose,
      contentType: file.type as ImageType | VideoType,
      bytes: file.size,
    },
  });
  await send(intent.upload, file, input.onProgress ?? (() => undefined), input.signal);
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await api.call('media.complete', { params: { mediaId: intent.mediaId } });
    } catch (error) {
      if (!isApiError(error, 'MEDIA_NOT_UPLOADED') || attempt >= 4) throw error;
      await wait(1000 * (attempt + 1));
    }
  }
}

/** States after which an asset will not change on its own. */
export const SETTLED_STATES = new Set([
  'ready',
  'held_for_review',
  'rejected',
  'failed',
  'deleted',
]);
