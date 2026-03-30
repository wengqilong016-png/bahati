import { useRef } from 'react';

interface PhotoCaptureProps {
  onCapture: (dataUrl: string) => void;
  label?: string;
}

export function PhotoCapture({ onCapture, label = 'Take Photo' }: PhotoCaptureProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleCapture = async () => {
    // Try Capacitor Camera if available
    try {
      // Dynamic import to avoid build errors when Capacitor is not available
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const photo = await Camera.getPhoto({
        quality: 70,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
      });
      if (photo.dataUrl) {
        onCapture(photo.dataUrl);
      }
    } catch {
      // Fallback to file input
      fileRef.current?.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onCapture(reader.result);
      }
    };
    reader.readAsDataURL(file);
    // Reset so same file can be selected again
    e.target.value = '';
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleCapture}
        style={{
          padding: '8px 16px',
          background: '#0066CC',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 14,
        }}
      >
        📷 {label}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </div>
  );
}
