import { useRef, type ChangeEvent } from 'react';

interface PhotoCaptureProps {
  /** Current data-URI or empty string */
  value: string;
  /** Called with the base64 data-URI when a photo is selected */
  onChange: (dataUri: string) => void;
  /** Whether the field is required */
  required?: boolean;
  label?: string;
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB safety limit
const MAX_DIMENSION = 1280; // max width/height in pixels

/**
 * Minimal photo input that works on low-end Android.
 * Uses a plain <input type="file" accept="image/*" capture="environment">
 * and converts the selected image to a resized, compressed base64 data-URI
 * so it can be stored in Dexie / synced as a string payload.
 */
export default function PhotoCapture({
  value,
  onChange,
  required = false,
  label = '拍照',
}: PhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function resizeImageFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        try {
          URL.revokeObjectURL(objectUrl);

          let { width, height } = img;
          if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas context not available'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        } catch (err) {
          reject(err);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Image load error'));
      };

      img.src = objectUrl;
    });
  }

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      console.warn('Selected image exceeds 10 MB limit, skipping.');
      return;
    }

    try {
      const dataUri = await resizeImageFile(file);
      onChange(dataUri);
    } catch (err) {
      console.error('Failed to process image file', err);
    }
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <span style={{ display: 'block', fontWeight: 500, marginBottom: 4 }}>
        {label}
        {required && <span style={{ color: '#ef4444' }}> *</span>}
      </span>

      {value && (
        <img
          src={value}
          alt="已选照片"
          style={{
            width: '100%',
            maxHeight: 200,
            objectFit: 'cover',
            borderRadius: 8,
            marginBottom: 8,
          }}
        />
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        style={{
          padding: '8px 16px',
          background: '#f1f5f9',
          border: '1px solid #cbd5e1',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 14,
        }}
      >
        {value ? '重新拍照' : '📷 拍照'}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        required={required && !value}
        onChange={handleChange}
        style={{ display: 'none' }}
      />
    </div>
  );
}
