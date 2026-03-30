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

/**
 * Minimal photo input that works on low-end Android.
 * Uses a plain <input type="file" accept="image/*" capture="environment">
 * and converts the selected image to a base64 data-URI so it can be stored
 * in Dexie / synced as a string payload.
 */
export default function PhotoCapture({
  value,
  onChange,
  required = false,
  label = '拍照',
}: PhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onChange(reader.result);
      }
    };
    reader.readAsDataURL(file);
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
