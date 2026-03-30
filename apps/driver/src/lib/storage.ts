// ============================================================
// Storage module — uploads photos to Supabase Storage
//
// Buckets needed (create via Supabase dashboard):
// 1. task-photos        (public read, authenticated write)
// 2. onboarding-photos  (public read, authenticated write)
//
// RLS policies (apply to both buckets):
// INSERT: auth.uid() = (path_tokens[1])::uuid
//   -- driver can only upload to their own folder
// SELECT: true
//   -- public read so boss app can view photos without auth
// ============================================================

import { supabase } from './supabase';

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_WIDTH = 1920;

// ---- Offline pending-upload queue (localStorage) --------------------------------

interface PendingPhotoUpload {
  id: string;
  dataUrl: string;
  bucket: 'task-photos' | 'onboarding-photos';
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
    reader.onerror = () => reject(new Error('无法读取文件'));
    reader.readAsDataURL(file);
  });
}

/**
 * Compress the image if it exceeds 2 MB.
 * Uses a canvas-based resize to max 1920 px width, JPEG quality 0.85.
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
        reject(new Error('无法创建 Canvas 上下文'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        blob => {
          if (!blob) {
            reject(new Error('图片压缩失败'));
            return;
          }
          const name = file.name.replace(/\.[^.]+$/, '.jpg');
          resolve(new File([blob], name, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        0.85,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('图片加载失败'));
    };

    img.src = objectUrl;
  });
}

/**
 * Upload a (possibly compressed) file to a Supabase Storage bucket.
 * Returns the public URL on success, or throws with a Chinese error message.
 * On failure also enqueues the upload for retry on next sync.
 */
async function uploadFileToBucket(
  file: File,
  bucket: 'task-photos' | 'onboarding-photos',
  path: string,
): Promise<string> {
  const compressed = await compressIfNeeded(file);

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
    throw new Error(`上传失败：${error.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

// ---- Public API ---------------------------------------------------------------

/**
 * Upload a task photo to Supabase Storage.
 * Bucket:  task-photos
 * Path:    {driver_id}/{task_date}/{taskId}/{timestamp}.{ext}
 *
 * Returns the public URL of the uploaded image.
 */
export async function uploadTaskPhoto(file: File, taskId: string): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录，无法上传照片');

  const taskDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const ext = file.name.split('.').pop() ?? 'jpg';
  const filename = `${Date.now()}.${ext}`;
  const path = `${user.id}/${taskDate}/${taskId}/${filename}`;

  return uploadFileToBucket(file, 'task-photos', path);
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
  if (!user) throw new Error('未登录，无法上传照片');

  const ext = file.name.split('.').pop() ?? 'jpg';
  const filename = `${Date.now()}.${ext}`;
  const path = `${user.id}/${onboardingId}/${filename}`;

  return uploadFileToBucket(file, 'onboarding-photos', path);
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
      const file = new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' });

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

  setPendingQueue(remaining);
}
