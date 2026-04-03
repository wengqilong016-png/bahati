// ============================================================
// Storage module — uploads photos to Supabase Storage
//
// Buckets (managed by Supabase migrations):
// 1. task-photos        (public read, authenticated write)
// 2. onboarding-photos  (public read, authenticated write)
// 3. reset-request-photos (reserved for score reset evidence uploads)
//
// RLS policies (applied by migration on all photo buckets):
// INSERT/UPDATE/SELECT: split_part(name, '/', 1) = auth.uid()::text
//   -- driver can only access objects under their own folder
// ============================================================

import { supabase } from './supabase';
import { getTodayDarEsSalaam } from './utils';

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_WIDTH = 1920;
export const STORAGE_BUCKETS = {
  TASK_PHOTOS: 'task-photos',
  ONBOARDING_PHOTOS: 'onboarding-photos',
} as const;
type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

// ---- Offline pending-upload queue (localStorage) --------------------------------

interface PendingPhotoUpload {
  id: string;
  dataUrl: string;
  bucket: StorageBucket;
  path: string;
  addedAt: string;
}

const PENDING_QUEUE_KEY = 'smartkiosk_pending_photo_uploads';

function getPendingQueue(): PendingPhotoUpload[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_QUEUE_KEY) ?? '[]') as PendingPhotoUpload[];
  } catch {
    return [];
  }
}

function setPendingQueue(q: PendingPhotoUpload[]): void {
  localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(q));
}

function addToPendingQueue(item: PendingPhotoUpload): void {
  const q = getPendingQueue();
  q.push(item);
  setPendingQueue(q);
}

// ---- Helpers ------------------------------------------------------------------

/** Read a File/Blob as a data URL (for offline queue storage). */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Compress the image if it exceeds 2 MB.
 * Resizes to max 1920 px width then progressively lowers JPEG quality (0.85 → 0.70 → 0.55 → 0.40)
 * until the result is ≤ 2 MB or the minimum quality is reached.
 * Always returns a JPEG File named with a `.jpg` extension.
 */
async function compressIfNeeded(file: File): Promise<File> {
  if (file.size <= MAX_SIZE_BYTES) return file;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to create Canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      const name = file.name.replace(/\.[^.]+$/, '.jpg');

      const tryCompress = (quality: number) => {
        canvas.toBlob(
          blob => {
            if (!blob) {
              reject(new Error('Image compression failed'));
              return;
            }
            if (blob.size <= MAX_SIZE_BYTES) {
              resolve(new File([blob], name, { type: 'image/jpeg' }));
              return;
            }
            const nextQuality = quality - 0.15;
            if (nextQuality >= 0.4) {
              tryCompress(nextQuality);
              return;
            }
            // Compressed to minimum quality — accept even if still above limit
            resolve(new File([blob], name, { type: 'image/jpeg' }));
          },
          'image/jpeg',
          quality,
        );
      };

      tryCompress(0.85);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };

    img.src = objectUrl;
  });
}

/**
 * Compress (if needed), then upload a file to a Supabase Storage bucket.
 * The caller provides a `buildPath` function that receives the final compressed
 * File so the storage path extension always matches the uploaded content type.
 * Returns the public URL on success, or throws with a Chinese error message.
 * On failure also enqueues the upload for retry on next sync.
 */
async function uploadFileToBucket(
  file: File,
  bucket: StorageBucket,
  buildPath: (compressed: File) => string,
): Promise<string> {
  const compressed = await compressIfNeeded(file);
  const path = buildPath(compressed);

  const { error } = await supabase.storage.from(bucket).upload(path, compressed, {
    upsert: true,
    contentType: compressed.type,
  });

  if (error) {
    // Queue for background retry when connectivity is restored
    try {
      const dataUrl = await fileToDataUrl(compressed);
      addToPendingQueue({
        id: crypto.randomUUID(),
        dataUrl,
        bucket,
        path,
        addedAt: new Date().toISOString(),
      });
    } catch {
      // Best-effort — if we can't queue it, we just lose it
    }
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error(`Failed to generate public URL for ${path}`);
  }
  return data.publicUrl;
}

// ---- Public API ---------------------------------------------------------------

/**
 * Upload a task photo to Supabase Storage.
 * Bucket:  task-photos
 * Path:    {driver_id}/{task_date}/{taskId}/{timestamp}.{ext}
 *
 * task_date uses Africa/Dar_es_Salaam time (same as saveDailyTask) so the folder always matches the record.
 * Returns the public URL of the uploaded image.
 */
export async function uploadTaskPhoto(file: File, taskId: string): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in. Cannot upload task photos.');

  // Use Africa/Dar_es_Salaam date to match task_date written by saveDailyTask()
  const taskDate = getTodayDarEsSalaam();

  return uploadFileToBucket(file, STORAGE_BUCKETS.TASK_PHOTOS, compressed => {
    const ext = compressed.name.split('.').pop() ?? 'jpg';
    return `${user.id}/${taskDate}/${taskId}/${Date.now()}.${ext}`;
  });
}

/**
 * Upload an onboarding photo to Supabase Storage.
 * Bucket:  onboarding-photos
 * Path:    {driver_id}/{onboardingId}/{timestamp}.{ext}
 *
 * Returns the public URL of the uploaded image.
 */
export async function uploadOnboardingPhoto(file: File, onboardingId: string): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in. Cannot upload onboarding photos.');

  return uploadFileToBucket(file, STORAGE_BUCKETS.ONBOARDING_PHOTOS, compressed => {
    const ext = compressed.name.split('.').pop() ?? 'jpg';
    return `${user.id}/${onboardingId}/${Date.now()}.${ext}`;
  });
}

/**
 * Retry any photo uploads that were queued during offline sessions.
 * Called automatically by startSync() whenever the app syncs.
 * Successfully retried items are removed from the queue.
 */
export async function retryPendingUploads(): Promise<void> {
  const queue = getPendingQueue();
  if (!queue.length) return;

  const remaining: PendingPhotoUpload[] = [];

  for (const item of queue) {
    try {
      const response = await fetch(item.dataUrl);
      const blob = await response.blob();
      // Derive the original extension from the storage path
      const pathExt = item.path.split('.').pop() ?? 'jpg';
      const mimeType = blob.type || `image/${pathExt}`;
      const file = new File([blob], `photo.${pathExt}`, { type: mimeType });

      const { error } = await supabase.storage
        .from(item.bucket)
        .upload(item.path, file, { upsert: true, contentType: file.type });

      if (error) {
        remaining.push(item);
      }
    } catch {
      remaining.push(item);
    }
  }

  try {
    setPendingQueue(remaining);
  } catch {
    // If localStorage is unavailable or quota is exceeded, don't let it
    // block the main sync cycle — remaining items will be re-queued next time.
    console.warn('[storage] Failed to persist pending photo upload queue');
  }
}
