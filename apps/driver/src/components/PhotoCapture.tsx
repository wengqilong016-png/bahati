import { useRef, useState, useEffect } from 'react';

export interface PhotoCaptureProps {
  /** Successfully uploaded photo URLs (controlled by parent). */
  photos: string[];
  /** Called whenever the list of uploaded photo URLs changes. */
  onPhotosChange: (urls: string[]) => void;
  /** Function that uploads a File and returns the public URL. */
  uploadFn: (file: File) => Promise<string>;
  /** Maximum number of photos allowed (default 5). */
  maxPhotos?: number;
  disabled?: boolean;
}

interface UploadItem {
  id: string;
  /** Object URL for local preview while uploading / on error. */
  previewUrl: string;
  status: 'uploading' | 'error';
  error?: string;
  file: File;
}

export function PhotoCapture({
  photos,
  onPhotosChange,
  uploadFn,
  maxPhotos = 5,
  disabled = false,
}: PhotoCaptureProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<UploadItem[]>([]);

  // Keep a ref to the latest photos so async upload callbacks don't close over stale values
  const photosRef = useRef(photos);
  photosRef.current = photos;

  // Track latest uploading items for cleanup on unmount
  const uploadingRef = useRef(uploading);
  uploadingRef.current = uploading;

  // Revoke all pending object URLs when the component unmounts to prevent memory leaks
  useEffect(() => {
    return () => {
      uploadingRef.current.forEach(u => URL.revokeObjectURL(u.previewUrl));
    };
  }, []);

  const atLimit = photos.length + uploading.length >= maxPhotos;

  const processFile = async (file: File) => {
    const id = crypto.randomUUID();
    const previewUrl = URL.createObjectURL(file);
    const item: UploadItem = { id, previewUrl, status: 'uploading', file };
    setUploading(prev => [...prev, item]);

    try {
      const url = await uploadFn(file);
      // Remove from uploading list and push to parent's photos.
      // Use photosRef.current to avoid stale closure when multiple uploads complete concurrently.
      setUploading(prev => prev.filter(u => u.id !== id));
      URL.revokeObjectURL(previewUrl);
      onPhotosChange([...photosRef.current, url]);
    } catch (err) {
      const error = err instanceof Error ? err.message : '上传失败';
      setUploading(prev =>
        prev.map(u => (u.id === id ? { ...u, status: 'error' as const, error } : u)),
      );
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    void processFile(file);
  };

  const retryUpload = (item: UploadItem) => {
    // Reset to uploading state and retry
    setUploading(prev =>
      prev.map(u => (u.id === item.id ? { ...u, status: 'uploading' as const, error: undefined } : u)),
    );
    void (async () => {
      try {
        const url = await uploadFn(item.file);
        setUploading(prev => prev.filter(u => u.id !== item.id));
        URL.revokeObjectURL(item.previewUrl);
        onPhotosChange([...photosRef.current, url]);
      } catch (err) {
        const error = err instanceof Error ? err.message : '上传失败';
        setUploading(prev =>
          prev.map(u => (u.id === item.id ? { ...u, status: 'error' as const, error } : u)),
        );
      }
    })();
  };

  const removeUploaded = (url: string) => {
    onPhotosChange(photos.filter(p => p !== url));
  };

  const cancelUploading = (item: UploadItem) => {
    URL.revokeObjectURL(item.previewUrl);
    setUploading(prev => prev.filter(u => u.id !== item.id));
  };

  const btnBase: React.CSSProperties = {
    padding: '8px 14px',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
  };

  return (
    <div>
      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button
          type="button"
          disabled={disabled || atLimit}
          onClick={() => cameraInputRef.current?.click()}
          style={{ ...btnBase, background: (disabled || atLimit) ? '#ccc' : '#0066CC' }}
        >
          📷 拍照
        </button>
        <button
          type="button"
          disabled={disabled || atLimit}
          onClick={() => galleryInputRef.current?.click()}
          style={{ ...btnBase, background: (disabled || atLimit) ? '#ccc' : '#555' }}
        >
          🖼 相册
        </button>
        {maxPhotos > 0 && (
          <span style={{ fontSize: 12, color: '#888', alignSelf: 'center' }}>
            {photos.length}/{maxPhotos}
          </span>
        )}
      </div>

      {/* Hidden inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* Thumbnails */}
      {(photos.length > 0 || uploading.length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {/* Successfully uploaded photos */}
          {photos.map((url, i) => (
            <div key={url} style={{ position: 'relative', width: 72, height: 72 }}>
              <img
                src={url}
                alt={`照片 ${i + 1}`}
                style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, border: '1px solid #ddd' }}
              />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeUploaded(url)}
                  style={{
                    position: 'absolute', top: -6, right: -6,
                    width: 20, height: 20, borderRadius: '50%',
                    background: '#c62828', color: '#fff', border: 'none',
                    cursor: 'pointer', fontSize: 11, lineHeight: '20px',
                    padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  title="删除"
                >
                  ✕
                </button>
              )}
            </div>
          ))}

          {/* In-progress / error items */}
          {uploading.map(item => (
            <div key={item.id} style={{ position: 'relative', width: 72, height: 72 }}>
              <img
                src={item.previewUrl}
                alt="上传中"
                style={{
                  width: 72, height: 72, objectFit: 'cover', borderRadius: 6,
                  border: `1px solid ${item.status === 'error' ? '#c62828' : '#0066CC'}`,
                  opacity: item.status === 'uploading' ? 0.5 : 1,
                }}
              />
              {item.status === 'uploading' && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(0,0,0,0.3)', borderRadius: 6,
                  color: '#fff', fontSize: 10,
                }}>
                  上传中…
                </div>
              )}
              {item.status === 'error' && (
                <>
                  <div style={{
                    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(198,40,40,0.7)', borderRadius: 6,
                    color: '#fff', fontSize: 9, padding: 2, textAlign: 'center',
                  }}>
                    <span>失败</span>
                    <button
                      type="button"
                      onClick={() => retryUpload(item)}
                      style={{
                        marginTop: 2, background: '#fff', color: '#c62828',
                        border: 'none', borderRadius: 3, fontSize: 9,
                        cursor: 'pointer', padding: '1px 4px',
                      }}
                    >
                      重试
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => cancelUploading(item)}
                    style={{
                      position: 'absolute', top: -6, right: -6,
                      width: 20, height: 20, borderRadius: '50%',
                      background: '#c62828', color: '#fff', border: 'none',
                      cursor: 'pointer', fontSize: 11, lineHeight: '20px',
                      padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    title="删除"
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Per-photo error messages */}
      {uploading.filter(u => u.status === 'error').map(item => (
        <p key={item.id} style={{ margin: '6px 0 0', fontSize: 12, color: '#c62828' }}>
          ⚠️ {item.error}
        </p>
      ))}
    </div>
  );
}
