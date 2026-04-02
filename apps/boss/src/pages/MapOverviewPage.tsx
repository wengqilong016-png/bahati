import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2xUrl from 'leaflet/dist/images/marker-icon-2x.png';
import markerIconUrl from 'leaflet/dist/images/marker-icon.png';
import markerShadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { supabase } from '../supabase';

// Fix default marker icon paths for bundled builds
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2xUrl,
  iconUrl: markerIconUrl,
  shadowUrl: markerShadowUrl,
});

interface Kiosk {
  id: string;
  serial_number: string;
  location_name: string;
  status: string;
  last_recorded_score: number;
  merchant_id: string;
  assigned_driver_id: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface Merchant {
  id: string;
  name: string;
}

interface Driver {
  id: string;
  full_name: string;
}

type FilterStatus = 'all' | 'active' | 'inactive' | 'maintenance';

const STATUS_COLORS: Record<string, string> = {
  active: '#1e7e34',
  maintenance: '#e65100',
  inactive: '#666',
};

const STATUS_BG: Record<string, string> = {
  active: '#e6f4ea',
  maintenance: '#fff3e0',
  inactive: '#f5f5f5',
};

// Dar es Salaam center
const DEFAULT_CENTER: [number, number] = [-6.7924, 39.2083];

function createColorIcon(color: string) {
  return L.divIcon({
    html: `<div style="
      width: 24px; height: 24px; border-radius: 50%;
      background: ${color}; border: 3px solid #fff;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    "></div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  });
}

export function MapOverviewPage() {
  const [kiosks, setKiosks] = useState<Kiosk[] | null>(null);
  const [merchants, setMerchants] = useState<Record<string, string>>({});
  const [drivers, setDrivers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);

      const [kiosksRes, merchantsRes, driversRes] = await Promise.all([
        supabase.from('kiosks').select('*').order('location_name', { ascending: true }),
        supabase.from('merchants').select('id, name'),
        supabase.from('drivers').select('id, full_name'),
      ]);

      if (cancelled) return;

      if (kiosksRes.error) setError(kiosksRes.error.message);
      else setKiosks(kiosksRes.data as Kiosk[]);

      const mMap: Record<string, string> = {};
      for (const m of (merchantsRes.data ?? []) as Merchant[]) {
        mMap[m.id] = m.name;
      }
      setMerchants(mMap);

      const dMap: Record<string, string> = {};
      for (const d of (driversRes.data ?? []) as Driver[]) {
        dMap[d.id] = d.full_name;
      }
      setDrivers(dMap);

      setLoading(false);
    };

    void fetchData();
    return () => { cancelled = true; };
  }, []);

  const filteredKiosks = kiosks?.filter(k => {
    if (filterStatus === 'all') return true;
    return k.status === filterStatus;
  });

  const mappableKiosks = filteredKiosks?.filter(k => k.latitude != null && k.longitude != null) ?? [];
  const unmappableKiosks = filteredKiosks?.filter(k => k.latitude == null || k.longitude == null) ?? [];

  const statusCounts = {
    all: kiosks?.length ?? 0,
    active: kiosks?.filter(k => k.status === 'active').length ?? 0,
    inactive: kiosks?.filter(k => k.status === 'inactive').length ?? 0,
    maintenance: kiosks?.filter(k => k.status === 'maintenance').length ?? 0,
  };

  return (
    <div style={{ padding: '20px 16px', maxWidth: 900 }}>
      <h2 style={{ margin: '0 0 6px', color: '#0066CC', fontSize: 20 }}>地图与路线概览</h2>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#888' }}>
        机器分布地图 · {mappableKiosks.length} 个已定位 / {(filteredKiosks?.length ?? 0)} 个总计
      </p>

      {error && <div style={{ background: '#fce8e6', color: '#c62828', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      {/* Status summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
        {([
          { key: 'all' as FilterStatus, label: '全部', color: '#0066CC' },
          { key: 'active' as FilterStatus, label: '运行中', color: '#1e7e34' },
          { key: 'inactive' as FilterStatus, label: '停用', color: '#666' },
          { key: 'maintenance' as FilterStatus, label: '维修中', color: '#e65100' },
        ]).map(s => (
          <button
            key={s.key}
            onClick={() => setFilterStatus(s.key)}
            style={{
              background: filterStatus === s.key ? s.color : '#fff',
              color: filterStatus === s.key ? '#fff' : s.color,
              border: filterStatus === s.key ? 'none' : `1px solid ${s.color}`,
              borderRadius: 10,
              padding: '10px 12px',
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            <p style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{statusCounts[s.key]}</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 600 }}>{s.label}</p>
          </button>
        ))}
      </div>

      {loading && <p style={{ color: '#666', textAlign: 'center', padding: 40 }}>Loading...</p>}

      {/* Leaflet Map */}
      {!loading && (
        <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #e0e0e0', marginBottom: 16 }}>
          <MapContainer
            center={mappableKiosks.length > 0
              ? [mappableKiosks[0].latitude!, mappableKiosks[0].longitude!]
              : DEFAULT_CENTER}
            zoom={12}
            style={{ height: 400, width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {mappableKiosks.map(k => (
              <Marker
                key={k.id}
                position={[k.latitude!, k.longitude!]}
                icon={createColorIcon(STATUS_COLORS[k.status] ?? '#666')}
              >
                <Popup>
                  <div style={{ minWidth: 160 }}>
                    <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 14 }}>📍 {k.location_name}</p>
                    <p style={{ margin: '0 0 2px', fontSize: 12, color: '#888' }}>{k.serial_number}</p>
                    <p style={{ margin: '0 0 2px', fontSize: 12 }}>商家: {merchants[k.merchant_id] ?? '—'}</p>
                    <p style={{ margin: '0 0 2px', fontSize: 12 }}>司机: {k.assigned_driver_id ? (drivers[k.assigned_driver_id] || '—') : '未分配'}</p>
                    <p style={{ margin: '0 0 2px', fontSize: 12 }}>分数: {k.last_recorded_score}</p>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 8,
                      fontSize: 11,
                      fontWeight: 600,
                      background: STATUS_BG[k.status] ?? '#f5f5f5',
                      color: STATUS_COLORS[k.status] ?? '#666',
                      textTransform: 'capitalize',
                    }}>
                      {k.status}
                    </span>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}

      {/* Unmapped kiosks fallback list */}
      {unmappableKiosks.length > 0 && (
        <>
          <h3 style={{ margin: '0 0 10px', fontSize: 15, color: '#888' }}>
            📋 未设置坐标的机器 ({unmappableKiosks.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {unmappableKiosks.map(k => {
              const statusColor = STATUS_COLORS[k.status] ?? '#666';
              const statusBg = STATUS_BG[k.status] ?? '#f5f5f5';

              return (
                <div
                  key={k.id}
                  style={{
                    background: '#fff',
                    borderRadius: 12,
                    padding: '14px 18px',
                    border: '1px solid #e0e0e0',
                    borderLeft: `4px solid ${statusColor}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>📍 {k.location_name}</p>
                      <p style={{ margin: '3px 0 0', fontSize: 12, color: '#888' }}>
                        {k.serial_number} · {merchants[k.merchant_id] ?? '—'}
                      </p>
                    </div>
                    <span style={{
                      padding: '3px 10px',
                      borderRadius: 10,
                      fontSize: 11,
                      fontWeight: 600,
                      background: statusBg,
                      color: statusColor,
                      flexShrink: 0,
                      textTransform: 'capitalize',
                    }}>
                      {k.status}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 11, color: '#888' }}>最新分数</p>
                      <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 700, color: '#0066CC' }}>{k.last_recorded_score}</p>
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: 11, color: '#888' }}>负责司机</p>
                      <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 600, color: '#333' }}>
                        {k.assigned_driver_id ? (drivers[k.assigned_driver_id] || '—') : '未分配'}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {!loading && filteredKiosks && filteredKiosks.length === 0 && (
        <p style={{ color: '#999', textAlign: 'center', padding: 40 }}>暂无机器数据</p>
      )}
    </div>
  );
}
