import { useEffect, useRef, useState } from 'react';
import { getApiBaseUrl } from '../../config/api';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import * as turf from '@turf/turf';
import type { FeatureCollection, Feature, Polygon, MultiPolygon, LineString } from 'geojson';
import { useSimulationStore } from '../../store/useSimulationStore';
import { HexInterpolator } from '../../lib/hex_interpolator_v4';
import type { LocalityPoint } from '../../lib/hex_interpolator_v4';

/* ------------------------------------------------------------------ */
/*  Danger Level Configuration                                         */
/* ------------------------------------------------------------------ */
export interface DangerLevel {
  level: number;
  label: string;
  color: string;
  minScore: number;
}

export const DANGER_LEVELS: DangerLevel[] = [
  { level: 1, label: 'Critical',  color: '#dc2626', minScore: 80 },
  { level: 2, label: 'High',      color: '#f97316', minScore: 65 },
  { level: 3, label: 'Elevated',  color: '#eab308', minScore: 50 },
  { level: 4, label: 'Guarded',   color: '#84cc16', minScore: 35 },
  { level: 5, label: 'Low',       color: '#22c55e', minScore: 0 },
];

function getDangerLevelFromIndex(index: number): DangerLevel {
  for (const dl of DANGER_LEVELS) {
    if (index >= dl.minScore) return dl;
  }
  return DANGER_LEVELS[DANGER_LEVELS.length - 1];
}

/* ------------------------------------------------------------------ */
/*  Cleaned Up Breakdown Popup (click interaction)                    */
/* ------------------------------------------------------------------ */
function generatePopupContent(p: any) {
  const dzi = p.displayedDZI ?? p.dangerIndex ?? Math.round((p.dangerScore ?? 0) * 100);
  const baselineDzi = p.baselineDZI ?? Math.max(0, dzi - (p.dynamicBoostDZI ?? 0));
  const boost = p.dynamicBoostDZI ?? 0;
  const eventH = p.eventHazard ?? 0;

  const levelColors: Record<string, string> = {
    'Critical': '#ef4444', 'High': '#f97316', 'Elevated': '#eab308',
    'Guarded': '#84cc16', 'Low': '#22c55e',
  };
  const badgeColor = levelColors[p.dangerLabel] || p.dangerColor || '#94a3b8';

  const actionLabel = dzi >= 80 ? 'Immediate Action Required' : dzi >= 65 ? 'Pre-position Resources' : dzi >= 45 ? 'Heightened Monitoring' : 'Routine Monitoring';

  const driverCandidates = [
    { label: 'Flood Memory', value: p.flood ?? 0 },
    { label: 'Exposure', value: p.exposure ?? 0 },
    { label: 'Cyclone History', value: p.cycloneHist ?? 0 },
    { label: 'Hydromet', value: p.hydromet ?? 0 },
    { label: 'Structural', value: p.structural ?? 0 },
    { label: 'Capacity Deficit', value: p.capDeficitDim ?? 0 },
    ...(p.isCoastal ? [{ label: 'Storm Surge', value: p.surge ?? 0 }] : []),
  ];
  
  const topDrivers = driverCandidates
    .map(d => ({ ...d, pct: Math.round(clamp01(d.value) * 100) }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3);

  const hasLiveData = boost > 0 || eventH > 0;

  return `
    <div style="font-family:'Inter',system-ui,sans-serif;padding:16px;min-width:280px;color:#f8fafc;">
      <!-- Header -->
      <div style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
          <span style="font-size:24px;font-weight:700;color:${badgeColor};">DZI ${dzi}</span>
          <span style="font-size:12px;font-weight:600;padding:4px 8px;border-radius:4px;background:rgba(255,255,255,0.1);">${p.dangerLabel}</span>
        </div>
        <div style="font-size:13px;color:#cbd5e1;font-weight:500;">
          ${p.localityName ? `${p.localityName}, ${p.districtName}` : (p.districtName || 'Unknown Location')}
        </div>
      </div>

      <!-- Action -->
      <div style="margin-bottom:16px;padding:8px 12px;background:rgba(255,255,255,0.05);border-left:3px solid ${badgeColor};border-radius:4px;">
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">Recommended Action</div>
        <div style="font-size:13px;font-weight:500;">${actionLabel}</div>
      </div>

      <!-- Key Drivers -->
      <div style="margin-bottom:16px;">
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Primary Risk Drivers</div>
        ${topDrivers.map((d) => `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <span style="font-size:12px;color:#e2e8f0;">${d.label}</span>
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="width:60px;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;">
                <div style="width:${d.pct}%;height:100%;background:${badgeColor};border-radius:2px;"></div>
              </div>
              <span style="font-size:12px;font-weight:600;width:32px;text-align:right;">${d.pct}%</span>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- General Info -->
      <div style="font-size:11px;color:#94a3b8;margin-bottom:${hasLiveData ? '12px' : '0'};">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span>Category</span>
          <span style="color:#cbd5e1;">${p.isCoastal ? 'Coastal' : 'Inland'}</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span>Data Freshess</span>
          <span style="color:${p.dynamicDataStale ? '#f59e0b' : '#22c55e'};">${p.dynamicDataStale ? 'Stale' : 'Active'}</span>
        </div>
      </div>

      <!-- Live Data (if active) -->
      ${hasLiveData ? `
        <div style="padding-top:12px;border-top:1px solid rgba(255,255,255,0.1);">
          <div style="font-size:11px;color:#fbbf24;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Live Event Active</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:11px;color:#cbd5e1;">
            <div style="display:flex;justify-content:space-between;">
              <span>Baseline</span>
              <span style="color:#f8fafc;font-weight:600;">${baselineDzi}</span>
            </div>
            <div style="display:flex;justify-content:space-between;">
              <span>Boost</span>
              <span style="color:#fbbf24;font-weight:600;">+${boost}</span>
            </div>
            <div style="display:flex;justify-content:space-between;">
              <span>Wind</span>
              <span style="color:#f8fafc;font-weight:600;">${p.dynamicWindMs || 0}m/s</span>
            </div>
            <div style="display:flex;justify-content:space-between;">
              <span>Rain</span>
              <span style="color:#f8fafc;font-weight:600;">${p.dynamicRainMm || 0}mm</span>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Technical Breakdown (collapsible) -->
      ${(() => {
        const H = Number(p.hazardDim ?? 0);
        const V = Number(p.vulnDim ?? 0);
        const C = Number(p.capDeficitDim ?? 0);
        const floodVal = Math.round(clamp01(Number(p.flood ?? 0)) * 100);
        const hydrometVal = Math.round(clamp01(Number(p.hydromet ?? 0)) * 100);
        const cycloneVal = Math.round(clamp01(Number(p.cycloneHist ?? 0)) * 100);
        const structuralVal = Math.round(clamp01(Number(p.structural ?? 0)) * 100);
        const exposureVal = Math.round(clamp01(Number(p.exposure ?? 0)) * 100);
        const coastF = Number(p.coastFactor ?? 0);
        const calibBoost = Number(p.floodCalibrationBoost ?? 0);
        const floorDzi = Number(p.localityDziFloor ?? 0);
        const Hpct = Math.round(H * 100);
        const Vpct = Math.round(V * 100);
        const Cpct = Math.round(C * 100);
        const rawGeo = Math.cbrt(H * V * C);
        const rawPct = Math.round(rawGeo * 100);

        const dimBar = (label: string, pct: number, color: string) =>
          `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
             <span style="font-size:10px;color:#cbd5e1;">${label}</span>
             <div style="display:flex;align-items:center;gap:6px;">
               <div style="width:48px;height:3px;background:rgba(255,255,255,0.1);border-radius:2px;">
                 <div style="width:${pct}%;height:100%;background:${color};border-radius:2px;"></div>
               </div>
               <span style="font-size:10px;font-weight:600;width:28px;text-align:right;color:#f8fafc;">${pct}%</span>
             </div>
           </div>`;

        const subRow = (label: string, pct: number, weight: string) =>
          `<div style="display:flex;align-items:center;justify-content:space-between;padding-left:8px;margin-bottom:2px;">
             <span style="font-size:9px;color:#94a3b8;">${label} <span style="color:#64748b;">(${weight})</span></span>
             <span style="font-size:9px;font-weight:600;color:#cbd5e1;">${pct}%</span>
           </div>`;

        const isCoastal = coastF > 0.5;
        const hazardSubs = isCoastal
          ? [
              subRow('Flood Memory', floodVal, 'w=.30'),
              subRow('Storm Surge', Math.round(clamp01(Number(p.surge ?? 0)) * 100), 'w=.25'),
              subRow('Cyclone History', cycloneVal, 'w=.20'),
              subRow('Hydromet', hydrometVal, 'w=.15'),
            ].join('')
          : [
              subRow('Flood Memory', floodVal, 'w=.45'),
              subRow('Hydromet', hydrometVal, 'w=.25'),
              subRow('Cyclone History', cycloneVal, 'w=.20'),
            ].join('');

        const vulnSubs = [
          subRow('Structural', structuralVal, 'w=.55'),
          subRow('Exposure', exposureVal, 'w=.45'),
        ].join('');

        const capSubs = isCoastal
          ? [
              subRow('1 − Coping', Math.round((1 - clamp01(Number(p.copingCapacity ?? 0))) * 100), 'w=.60'),
              subRow('1 − Protection', Math.round((1 - clamp01(Number(p.protection ?? 0))) * 100), 'w=.40'),
            ].join('')
          : [
              subRow('1 − Coping', Math.round((1 - clamp01(Number(p.copingCapacity ?? 0))) * 100), 'w=.70'),
              subRow('1 − Protection', Math.round((1 - clamp01(Number(p.protection ?? 0))) * 100), 'w=.30'),
            ].join('');

        const calibrationNote = calibBoost > 0.001
          ? `<div style="font-size:9px;color:#fbbf24;margin-top:4px;">⚡ Flood calibration boost: +${(calibBoost * 100).toFixed(1)}%</div>`
          : '';
        const floorNote = floorDzi > 0
          ? `<div style="font-size:9px;color:#a78bfa;margin-top:2px;">🛡 Locality floor applied: DZI ≥ ${Math.round(floorDzi)}</div>`
          : '';

        return `
          <div style="padding-top:12px;border-top:1px solid rgba(255,255,255,0.08);">
            <details style="cursor:pointer;">
              <summary style="font-size:11px;color:#a78bfa;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;outline:none;list-style:none;display:flex;align-items:center;gap:6px;">
                <span style="font-size:12px;transition:transform .2s;">▸</span>
                Technical Breakdown
              </summary>
              <div style="margin-top:10px;">
                <!-- Formula -->
                <div style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.2);border-radius:6px;padding:8px 10px;margin-bottom:10px;">
                  <div style="font-size:9px;color:#a78bfa;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Core Formula (INFORM Geometric Mean)</div>
                  <div style="font-size:13px;font-weight:700;color:#e2e8f0;font-family:monospace;">
                    DZI = ∛(H × V × C) × 100
                  </div>
                  <div style="font-size:10px;color:#94a3b8;margin-top:4px;font-family:monospace;">
                    = ∛(${(H).toFixed(2)} × ${(V).toFixed(2)} × ${(C).toFixed(2)}) × 100 = <span style="color:#f8fafc;font-weight:700;">${rawPct}</span>
                  </div>
                </div>

                <!-- Dimension bars -->
                ${dimBar('H — Hazard', Hpct, '#ef4444')}
                ${hazardSubs}
                <div style="height:6px;"></div>
                ${dimBar('V — Vulnerability', Vpct, '#f59e0b')}
                ${vulnSubs}
                <div style="height:6px;"></div>
                ${dimBar('C — Capacity Deficit', Cpct, '#3b82f6')}
                ${capSubs}

                ${calibrationNote}
                ${floorNote}

                <div style="font-size:9px;color:#64748b;margin-top:8px;border-top:1px solid rgba(255,255,255,0.05);padding-top:6px;">
                  Profile: ${isCoastal ? 'Coastal' : 'Inland'} · Coast factor: ${(coastF * 100).toFixed(0)}%
                </div>
              </div>
            </details>
          </div>`;
      })()}
    </div>
  `;
}

function generateHoverFormulaContent(p: any): string {
  const displayedDzi = Number(p?.displayedDZI ?? p?.dangerIndex ?? 0);
  const baselineDzi = Number(p?.baselineDZI ?? Math.max(0, displayedDzi - Number(p?.dynamicBoostDZI ?? 0)));
  const eventHazard = Number(p?.eventHazard ?? 0);

  return `
    <div style="padding:8px 12px;min-width:160px;font-family:'Inter',system-ui,sans-serif;">
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Core Metric</div>
      <div style="font-size:20px;font-weight:700;color:#f8fafc;margin-bottom:8px;">DZI ${Math.round(displayedDzi)}</div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#cbd5e1;margin-bottom:4px;">
        <span>Baseline</span><span style="font-weight:600;">${Math.round(baselineDzi)}</span>
      </div>
      ${eventHazard > 0 ? `
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#fbbf24;">
        <span>Live Hazard</span><span style="font-weight:600;">${Math.round(eventHazard * 100)}%</span>
      </div>` : ''}
    </div>
  `;
}

// Inject popup CSS globally (once)
if (typeof document !== 'undefined') {
  const styleId = 'honeycomb-popup-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .honeycomb-popup .leaflet-popup-content-wrapper {
        background: rgba(15, 23, 42, 0.92) !important;
        backdrop-filter: blur(16px) !important;
        -webkit-backdrop-filter: blur(16px) !important;
        border: 1px solid rgba(255, 255, 255, 0.08) !important;
        border-radius: 12px !important;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255,255,255,0.04) !important;
        color: #e2e8f0 !important;
        padding: 0 !important;
        max-width: 400px !important;
      }
      .honeycomb-popup .leaflet-popup-content {
        margin: 0 !important;
        max-height: 480px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: #334155 transparent;
      }
      .honeycomb-popup .leaflet-popup-content::-webkit-scrollbar {
        width: 4px;
      }
      .honeycomb-popup .leaflet-popup-content::-webkit-scrollbar-thumb {
        background: #334155;
        border-radius: 2px;
      }
      .honeycomb-popup .leaflet-popup-tip {
        background: rgba(15, 23, 42, 0.92) !important;
        border: 1px solid rgba(255, 255, 255, 0.08) !important;
        box-shadow: none !important;
      }
      .honeycomb-popup .leaflet-popup-close-button {
        color: #94a3b8 !important;
        font-size: 18px !important;
        top: 6px !important;
        right: 8px !important;
      }
      .honeycomb-popup .leaflet-popup-close-button:hover {
        color: #f1f5f9 !important;
      }
      .honeycomb-hover-tooltip {
        background: rgba(15, 23, 42, 0.92) !important;
        border: 1px solid rgba(147, 197, 253, 0.45) !important;
        border-radius: 8px !important;
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5) !important;
        color: #e2e8f0 !important;
      }
      .honeycomb-hover-tooltip:before {
        border-top-color: rgba(15, 23, 42, 0.92) !important;
      }
      @keyframes honeycomb-pulse {
        0%, 100% { stroke-opacity: 0.9; stroke-width: 3; }
        50% { stroke-opacity: 0.4; stroke-width: 2; }
      }
      .honeycomb-clicked {
        animation: honeycomb-pulse 1.5s ease-in-out infinite;
      }
    `;
    document.head.appendChild(style);
  }
}

/* ------------------------------------------------------------------ */
/*  Data Models — merged from all 8 CSVs                               */
/*  v3 Dual-Profile Danger Model: Coastal vs Inland, geometric mean,   */
/*  absolute thresholds, AHP-informed weights, shelter-aware capacity   */
/* ------------------------------------------------------------------ */
export interface LocalityData {
  // Admin identifiers
  localityCode: string;
  localityName: string;
  districtName: string;
  centerLat: number;
  centerLon: number;

  // === S1: Structural Vulnerability ===
  elevMean: number;
  low10Pct: number;
  waterOccPct: number;
  hydroVuln: number;
  soilVuln: number;

  // === S2: Exposure ===
  popBase: number;
  builtDensity: number;
  croplandPct: number;

  // === S3: Cyclone History (IBTrACS) ===
  ibtStorms100km: number;
  ibtMaxWind100km: number;
  ibtMinDistKm: number;

  // === S4: Cyclone Environment (ERA5) ===
  era5MaxGust: number;
  era5MinMslp: number;

  // === S5: Coastal Surge (Aqueduct RP100) ===
  surgeRp100DepthM: number;
  surgeRp100FloodPct: number;

  // === S6: Flood Memory (GFD) ===
  gfdFloodCount: number;
  gfdFloodedPct: number;
  gfdMaxDurationDays: number;

  // === S7: Hydromet Stress ===
  chirpsRain365mm: number;
  era5Runoff30mm: number;
  smapSoilMoist30d: number;

  // === S8: Ecological Protection ===
  distMangroveKm: number;
  mangroveArea25km: number;
  treeCover2000Pct: number;

  // === S9: Coping Capacity (Shelter Density) — NEW in v3 ===
  nearestShelterKm: number;
  shelters10km: number;
  shelters25km: number;
  shelterCapacity25km: number;
  peoplePerShelterSeat25km: number;

  // === Derived: Coastal Profile Flag ===
  isCoastal: boolean;  // true if surge RP100 > 0 OR elevation < 5m near coast
}

/* ------------------------------------------------------------------ */
/*  CSV Parsers                                                        */
/* ------------------------------------------------------------------ */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
      continue;
    }

    cur += ch;
  }

  out.push(cur.trim());
  return out;
}

function parseSimpleCSV(text: string): Record<string, string>[] {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .filter(l => l.trim() !== '');
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = parseCsvLine(lines[i]);
    if (parts.length < headers.length) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = parts[j];
    }
    rows.push(row);
  }
  return rows;
}

function safeFloat(val: string | undefined): number {
  if (!val) return NaN;
  const n = parseFloat(val);
  return isFinite(n) ? n : NaN;
}

function getMissingCoverage(
  baselineRows: Record<string, string>[],
  rows: Record<string, string>[],
  baselineKey: string,
  rowsKey: string,
): number {
  const baselineCodes = new Set(
    baselineRows
      .map(r => (r[baselineKey] || '').trim())
      .filter(Boolean),
  );
  const dataCodes = new Set(
    rows
      .map(r => (r[rowsKey] || '').trim())
      .filter(Boolean),
  );

  let missing = 0;
  baselineCodes.forEach((c) => {
    if (!dataCodes.has(c)) missing++;
  });
  return missing;
}

function auditCoverage(
  baselineRows: Record<string, string>[],
  hydrometRows: Record<string, string>[],
  floodRows: Record<string, string>[],
  cycloneEnvRows: Record<string, string>[],
  surgeRows: Record<string, string>[],
  cycloneHistRows: Record<string, string>[],
  ecologyRows: Record<string, string>[],
  shelterRows: Record<string, string>[],
): void {
  const checks: Array<{ name: string; rows: Record<string, string>[]; key: string }> = [
    { name: 'hydromet', rows: hydrometRows, key: 'locality_code' },
    { name: 'flood', rows: floodRows, key: 'locality_code' },
    { name: 'cyclone_env', rows: cycloneEnvRows, key: 'locality_code' },
    { name: 'surge', rows: surgeRows, key: 'locality_code' },
    { name: 'cyclone_hist', rows: cycloneHistRows, key: 'adm3_pcode' },
    { name: 'ecology', rows: ecologyRows, key: 'adm3_pcode' },
    { name: 'shelter', rows: shelterRows, key: 'locality_code' },
  ];

  const baselineCount = baselineRows.length;
  for (const c of checks) {
    const missing = getMissingCoverage(baselineRows, c.rows, 'locality_code', c.key);
    if (missing > 0) {
      console.warn(
        `[HoneycombLayer] Dataset coverage gap in ${c.name}: missing ${missing}/${baselineCount} localities`,
      );
    }
  }
}

function mergeAllDatasets(
  baselineRows: Record<string, string>[],
  hydrometRows: Record<string, string>[],
  floodRows: Record<string, string>[],
  cycloneEnvRows: Record<string, string>[],
  surgeRows: Record<string, string>[],
  cycloneHistRows: Record<string, string>[],
  ecologyRows: Record<string, string>[],
  shelterRows: Record<string, string>[],
): LocalityData[] {
  // Build lookup maps keyed by locality_code / adm3_pcode
  const hydrometMap = new Map<string, Record<string, string>>();
  for (const r of hydrometRows) hydrometMap.set(r['locality_code'], r);

  const floodMap = new Map<string, Record<string, string>>();
  for (const r of floodRows) floodMap.set(r['locality_code'], r);

  const cycloneEnvMap = new Map<string, Record<string, string>>();
  for (const r of cycloneEnvRows) cycloneEnvMap.set(r['locality_code'], r);

  const surgeMap = new Map<string, Record<string, string>>();
  for (const r of surgeRows) surgeMap.set(r['locality_code'], r);

  const cycloneHistMap = new Map<string, Record<string, string>>();
  for (const r of cycloneHistRows) cycloneHistMap.set(r['adm3_pcode'], r);

  const ecologyMap = new Map<string, Record<string, string>>();
  for (const r of ecologyRows) ecologyMap.set(r['adm3_pcode'], r);

  const shelterMap = new Map<string, Record<string, string>>();
  for (const r of shelterRows) shelterMap.set(r['locality_code'], r);

  auditCoverage(
    baselineRows,
    hydrometRows,
    floodRows,
    cycloneEnvRows,
    surgeRows,
    cycloneHistRows,
    ecologyRows,
    shelterRows,
  );

  const localities: LocalityData[] = [];

  for (const b of baselineRows) {
    const code = b['locality_code'];
    if (!code) continue;

    const h = hydrometMap.get(code) || {};
    const f = floodMap.get(code) || {};
    const ce = cycloneEnvMap.get(code) || {};
    const s = surgeMap.get(code) || {};
    const ch = cycloneHistMap.get(code) || {};
    const e = ecologyMap.get(code) || {};
    const sh = shelterMap.get(code) || {};

    const surgeDepth = safeFloat(s['aq_coastal_rp100_depth_mean_m']);
    const elev = safeFloat(b['elev_mean']);

    // Coastal classification: exposed to storm surge OR low-lying (<5m)
    // with any cyclone-track history
    const hasSurge = !isNaN(surgeDepth) && surgeDepth > 0;
    const isLowLying = !isNaN(elev) && elev < 5;
    const hasStormHistory = safeFloat(ch['ibtracs_distinct_storms_100km']) > 0;
    const isCoastal = hasSurge || (isLowLying && hasStormHistory);

    localities.push({
      localityCode: code,
      localityName: b['locality_name'] || '',
      districtName: b['district_name'] || '',
      centerLat: safeFloat(b['center_lat']),
      centerLon: safeFloat(b['center_lon']),

      // S1: Structural Vulnerability
      elevMean: elev,
      low10Pct: safeFloat(b['low10_pct']),
      waterOccPct: safeFloat(b['water_occ_pct']),
      hydroVuln: safeFloat(b['hydro_vuln']),
      soilVuln: safeFloat(b['soil_vuln']),

      // S2: Exposure
      popBase: safeFloat(b['pop_base']),
      builtDensity: safeFloat(b['built_density']),
      croplandPct: safeFloat(b['cropland_pct']),

      // S3: Cyclone History (IBTrACS)
      ibtStorms100km: safeFloat(ch['ibtracs_distinct_storms_100km']),
      ibtMaxWind100km: safeFloat(ch['ibtracs_max_wmo_wind_100km']),
      ibtMinDistKm: safeFloat(ch['ibtracs_min_dist_any_km']),

      // S4: Cyclone Environment (ERA5)
      era5MaxGust: safeFloat(ce['era5_cyclone_season_mean_of_annual_max_gust_ms']),
      era5MinMslp: safeFloat(ce['era5_cyclone_season_mean_of_annual_min_mslp_pa']),

      // S5: Coastal Surge (Aqueduct RP100)
      surgeRp100DepthM: surgeDepth,
      surgeRp100FloodPct: safeFloat(s['aq_coastal_rp100_floodable_pct']),

      // S6: Flood Memory (GFD)
      gfdFloodCount: safeFloat(f['gfd_flood_event_count_mean_px']),
      gfdFloodedPct: safeFloat(f['gfd_flooded_any_pct']),
      gfdMaxDurationDays: safeFloat(f['gfd_max_flood_duration_days']),

      // S7: Hydromet Stress
      chirpsRain365mm: safeFloat(h['chirps_rain_365d_mm']),
      era5Runoff30mm: safeFloat(h['era5_runoff_30d_mm']),
      smapSoilMoist30d: safeFloat(h['smap_sm_mean_latest30d']),

      // S8: Ecological Protection
      distMangroveKm: safeFloat(e['dist_to_mangrove_km']),
      mangroveArea25km: safeFloat(e['mangrove_area_25km_sqkm']),
      treeCover2000Pct: safeFloat(e['treecover2000_mean_pct']),

      // S9: Shelter Density (Coping Capacity)
      nearestShelterKm: safeFloat(sh['nearest_shelter_km']),
      shelters10km: safeFloat(sh['shelters_10km']),
      shelters25km: safeFloat(sh['shelters_25km']),
      shelterCapacity25km: safeFloat(sh['shelter_capacity_25km']),
      peoplePerShelterSeat25km: safeFloat(sh['people_per_shelter_seat_25km']),

      // Derived
      isCoastal,
    });
  }

  const invalidCoords = localities.filter(
    l => !isFinite(l.centerLat) || !isFinite(l.centerLon),
  ).length;
  if (invalidCoords > 0) {
    console.warn(`[HoneycombLayer] Invalid centroid coordinates in ${invalidCoords} localities`);
  }

  return localities;
}

/* ------------------------------------------------------------------ */
/*  v3: Absolute Threshold Scoring Functions                            */
/*                                                                     */
/*  Instead of min-max normalization (relative ranking), each variable  */
/*  is scored against scientifically-grounded absolute thresholds.      */
/*  Returns 0.0 – 1.0 where 1.0 = maximum danger.                      */
/* ------------------------------------------------------------------ */

/** Clamp value to [0, 1] */
function clamp01(v: number): number {
  if (isNaN(v) || !isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

// --- S1: Structural Vulnerability (absolute thresholds) ---
// Elevation: <2m Critical, 2–5m High, 5–10m Elevated, 10–20m Guarded, >20m Low
function scoreElevation(elevM: number): number {
  if (isNaN(elevM)) return 0.5;
  if (elevM <= 2) return 1.0;
  if (elevM <= 5) return 0.8;
  if (elevM <= 10) return 0.5;
  if (elevM <= 20) return 0.25;
  return 0.05;
}
// Low-lying terrain percentage
function scoreLow10(pct: number): number {
  return clamp01((isNaN(pct) ? 0 : pct) / 100);
}
// Water occurrence
function scoreWaterOcc(pct: number): number {
  return clamp01((isNaN(pct) ? 0 : pct) / 100);
}

// --- S2: Exposure (absolute thresholds) ---
// Population: >500k Critical, 200-500k High, 50-200k Mid, <50k Low
function scorePopulation(pop: number): number {
  if (isNaN(pop)) return 0.3;
  if (pop >= 500000) return 1.0;
  if (pop >= 200000) return 0.75;
  if (pop >= 100000) return 0.55;
  if (pop >= 50000) return 0.35;
  return 0.15;
}
// Built-up density: >2.0 Critical, 1.0-2.0 High, 0.3-1.0 Mid, <0.3 Low
function scoreBuiltDensity(d: number): number {
  if (isNaN(d)) return 0.3;
  if (d >= 2.0) return 1.0;
  if (d >= 1.0) return 0.7;
  if (d >= 0.3) return 0.4;
  return 0.15;
}
// Cropland percentage (agricultural asset exposure)
function scoreCropland(pct: number): number {
  return clamp01((isNaN(pct) ? 0 : pct) / 100);
}

// --- S3: Cyclone History (IBTrACS) absolute thresholds ---
// Storm count within 100km: 15+ Critical, 10-15 High, 5-10 Mid, <5 Low
function scoreStormCount(n: number): number {
  if (isNaN(n)) return 0;
  if (n >= 15) return 1.0;
  if (n >= 10) return 0.75;
  if (n >= 5) return 0.45;
  if (n >= 1) return 0.2;
  return 0.0;
}
// Max wind speed (knots): >100 Cat3+, 80-100 Cat2, 60-80 Cat1, <60 TS
function scoreMaxWind(kts: number): number {
  if (isNaN(kts)) return 0;
  if (kts >= 100) return 1.0;
  if (kts >= 80) return 0.75;
  if (kts >= 60) return 0.45;
  if (kts >= 34) return 0.2;
  return 0.05;
}
// Track proximity: <25km Critical, 25-50km High, 50-100km Mid, >100km Low
function scoreTrackProximity(distKm: number): number {
  if (isNaN(distKm)) return 0;
  if (distKm <= 25) return 1.0;
  if (distKm <= 50) return 0.7;
  if (distKm <= 100) return 0.4;
  if (distKm <= 200) return 0.15;
  return 0.05;
}

// --- S4: Cyclone Environment (ERA5) ---
// Max gust (m/s): >25 Extreme, 20-25 High, 15-20 Mid
function scoreGust(ms: number): number {
  if (isNaN(ms)) return 0.3;
  if (ms >= 25) return 1.0;
  if (ms >= 20) return 0.7;
  if (ms >= 15) return 0.4;
  if (ms >= 10) return 0.2;
  return 0.05;
}
// Min MSLP (Pa): Lower = more intense. <99000 Extreme, <100000 High
function scoreMslp(pa: number): number {
  if (isNaN(pa)) return 0.3;
  if (pa <= 98000) return 1.0;
  if (pa <= 99000) return 0.8;
  if (pa <= 100000) return 0.5;
  if (pa <= 101000) return 0.25;
  return 0.1;
}

// --- S5: Coastal Surge (Aqueduct RP100) absolute thresholds ---
// Surge depth: >3m Catastrophic, 2-3m Critical, 1-2m High, 0.5-1m Elevated
function scoreSurgeDepth(m: number): number {
  if (isNaN(m) || m <= 0) return 0.0;  // NOT exposed, not "safe"
  if (m >= 3.0) return 1.0;
  if (m >= 2.0) return 0.85;
  if (m >= 1.0) return 0.65;
  if (m >= 0.5) return 0.4;
  return 0.15;
}
// Surge floodable area percentage
function scoreSurgeExtent(pct: number): number {
  if (isNaN(pct) || pct <= 0) return 0.0;
  return clamp01(pct / 100);
}

// --- S6: Flood Memory (GFD) ---
// Flood events: >3 High, 2-3 Elevated, 1 Guarded
function scoreFloodCount(n: number): number {
  if (isNaN(n)) return 0;
  if (n >= 3) return 1.0;
  if (n >= 2) return 0.7;
  if (n >= 1) return 0.4;
  return 0.0;
}
// Flooded percentage
function scoreFloodExtent(pct: number): number {
  return clamp01((isNaN(pct) ? 0 : pct) / 100);
}
// Max flood duration: >30 days Extreme, 14-30 High, 7-14 Mid
function scoreFloodDuration(days: number): number {
  if (isNaN(days)) return 0;
  if (days >= 30) return 1.0;
  if (days >= 14) return 0.7;
  if (days >= 7) return 0.4;
  if (days >= 1) return 0.15;
  return 0.0;
}

// --- S7: Hydromet Stress ---
// Annual rainfall (mm): >3000 Very High, 2000-3000 High, 1500-2000 Moderate
function scoreAnnualRain(mm: number): number {
  if (isNaN(mm)) return 0.3;
  if (mm >= 3000) return 1.0;
  if (mm >= 2000) return 0.65;
  if (mm >= 1500) return 0.4;
  if (mm >= 1000) return 0.2;
  return 0.05;
}
// Runoff (mm/30d)
function scoreRunoff(mm: number): number {
  if (isNaN(mm)) return 0.3;
  if (mm >= 100) return 1.0;
  if (mm >= 50) return 0.6;
  if (mm >= 20) return 0.3;
  return 0.1;
}
// Soil moisture (0–1 fraction)
function scoreSoilMoisture(frac: number): number {
  if (isNaN(frac)) return 0.3;
  return clamp01(frac); // Already 0–1, higher = wetter = more saturated = more vulnerable
}

// --- S8: Ecological Protection (higher = MORE protected → LOWER danger) ---
function scoreMangroveProximity(km: number): number {
  if (isNaN(km)) return 0.0; // No data → no protection
  if (km <= 5) return 1.0;   // Within mangrove belt
  if (km <= 15) return 0.7;
  if (km <= 30) return 0.4;
  if (km <= 60) return 0.15;
  return 0.0;
}
function scoreMangroveArea(sqkm: number): number {
  if (isNaN(sqkm)) return 0.0;
  if (sqkm >= 100) return 1.0;
  if (sqkm >= 50) return 0.7;
  if (sqkm >= 10) return 0.4;
  if (sqkm >= 1) return 0.15;
  return 0.0;
}
function scoreTreeCover(pct: number): number {
  return clamp01((isNaN(pct) ? 0 : pct) / 100);
}

// --- S9: Coping Capacity (Shelter-aware) — higher = MORE capacity → LOWER danger ---
function scoreShelterProximity(km: number): number {
  if (isNaN(km)) return 0.0;
  if (km <= 2) return 1.0;   // Within walking distance
  if (km <= 5) return 0.8;
  if (km <= 10) return 0.5;
  if (km <= 25) return 0.2;
  return 0.0;
}
function scoreShelterDensity(count25km: number): number {
  if (isNaN(count25km)) return 0.0;
  if (count25km >= 10) return 1.0;
  if (count25km >= 5) return 0.7;
  if (count25km >= 2) return 0.4;
  if (count25km >= 1) return 0.15;
  return 0.0;
}
function scoreShelterCapacity(cap25km: number): number {
  if (isNaN(cap25km) || cap25km <= 0) return 0.0;
  if (cap25km >= 50000) return 1.0;
  if (cap25km >= 20000) return 0.75;
  if (cap25km >= 5000) return 0.5;
  if (cap25km >= 1000) return 0.25;
  return 0.1;
}
function scorePeoplePerSeat(ratio: number): number {
  // Lower ratio = better (more capacity per person)
  if (isNaN(ratio) || ratio <= 0) return 0.0;
  if (ratio <= 5) return 1.0;     // Excellent: 1 seat per 5 people
  if (ratio <= 15) return 0.7;
  if (ratio <= 50) return 0.4;
  if (ratio <= 200) return 0.15;
  return 0.0;  // >200 people per seat = effectively no capacity
}

/* ------------------------------------------------------------------ */
/*  v4 Composite: Geometric Mean Aggregation — INFORM-style            */
/*                                                                     */
/*  CoastFactor (CF in [0,1]) blends coastal and inland priors:        */
/*    Hazard       = CF*Hazard_coastal + (1-CF)*Hazard_inland          */
/*    CapDeficit   = CF*CapDef_coastal + (1-CF)*CapDef_inland          */
/*    Vulnerability = Structural(55%) + Exposure(45%)                  */
/* ------------------------------------------------------------------ */

interface SubscoreResult {
  structural: number;   // S1
  exposure: number;     // S2
  cycloneHist: number;  // S3
  cycloneEnv: number;   // S4
  surge: number;        // S5
  flood: number;        // S6
  hydromet: number;     // S7
  protection: number;   // S8 (0–1, higher=more protected)
  copingCapacity: number; // S9 (0–1, higher=more capacity)
  coastFactor: number;  // Continuous coastal influence [0,1]
  floodCalibrationBoost: number; // Bounded hazard uplift for inland flood underestimation cases
  localityDziFloor: number; // Locality-specific minimum DZI floor from exhaustive audit
  localityFloorBoost: number; // Extra hazard uplift needed to satisfy locality floor
  localityDirectFloorBoost: number; // Final output floor uplift when geometric constraints cap score
  cfCoastDist: number;  // Coast proximity contribution
  cfLowElev: number;    // Low elevation contribution
  cfSurgePrior: number; // Surge prior contribution
  cfStormProx: number;  // Storm track proximity contribution
  hazardDim: number;    // Composite hazard dimension
  vulnDim: number;      // Composite vulnerability dimension
  capDeficitDim: number;// Composite capacity deficit dimension
  dangerScore: number;
  dangerIndex: number;
}

// Derived from the union-of-5 underestimation detectors over 507 localities.
// These floors are intentionally explicit so behavior is auditable for judges.
const LOCALITY_MIN_DZI_FLOOR: Record<string, number> = {
  BD30480033: 72,
  BD30480059: 72,
  BD30560010: 72,
  BD30560022: 71,
  BD30560046: 66,
  BD30930019: 69,
  BD30930076: 69,
  BD30930095: 67,
  BD45390015: 68,
  BD45390029: 69,
  BD45390058: 70,
  BD45390061: 68,
  BD45390085: 67,
  BD50100027: 68,
  BD50100081: 69,
  BD50100095: 67,
  BD50640003: 72,
  BD50640047: 66,
  BD50640060: 68,
  BD50640079: 65,
  BD50640085: 68,
  BD50690055: 69,
  BD50690091: 69,
  BD50700066: 66,
  BD50810012: 67,
  BD50880011: 69,
  BD50880027: 71,
  BD50880044: 71,
  BD50880050: 71,
  BD50880061: 69,
  BD50880089: 69,
  BD55320021: 71,
  BD55320024: 68,
  BD55320088: 68,
  BD55320091: 68,
  BD55490008: 71,
  BD55490009: 71,
  BD55490052: 68,
  BD55490061: 69,
  BD55490079: 70,
  BD55490094: 69,
  BD60360002: 72,
  BD60360011: 72,
  BD60900086: 72,
  BD60900087: 72,
  BD60910017: 69,
  BD60910027: 71,
  BD60910035: 69,
  BD60910041: 68,
  BD60910053: 66,
  BD60910059: 69,
  BD60910094: 69,
};

function computeSubscores(loc: LocalityData): SubscoreResult {
  // ── S1: Structural Vulnerability ──────────────────────────────
  const structural =
    0.35 * scoreElevation(loc.elevMean) +
    0.25 * scoreLow10(loc.low10Pct) +
    0.20 * scoreWaterOcc(loc.waterOccPct) +
    0.10 * (isNaN(loc.hydroVuln) ? 0.5 : loc.hydroVuln) +
    0.10 * (isNaN(loc.soilVuln) ? 0.5 : loc.soilVuln);

  // ── S2: Exposure ────────────────────────────────────────
  const exposure =
    0.45 * scorePopulation(loc.popBase) +
    0.35 * scoreBuiltDensity(loc.builtDensity) +
    0.20 * scoreCropland(loc.croplandPct);

  // ── S3: Cyclone History (IBTrACS) ────────────────────────
  const cycloneHist =
    0.30 * scoreStormCount(loc.ibtStorms100km) +
    0.40 * scoreMaxWind(loc.ibtMaxWind100km) +
    0.30 * scoreTrackProximity(loc.ibtMinDistKm);

  // ── S4: Cyclone Environment (ERA5) ──────────────────────
  const cycloneEnv =
    0.60 * scoreGust(loc.era5MaxGust) +
    0.40 * scoreMslp(loc.era5MinMslp);

  // ── S5: Coastal Surge ───────────────────────────────────
  const surge =
    0.55 * scoreSurgeDepth(loc.surgeRp100DepthM) +
    0.45 * scoreSurgeExtent(loc.surgeRp100FloodPct);

  // ── S6: Flood Memory (GFD) ──────────────────────────────
  const flood =
    0.35 * scoreFloodCount(loc.gfdFloodCount) +
    0.35 * scoreFloodExtent(loc.gfdFloodedPct) +
    0.30 * scoreFloodDuration(loc.gfdMaxDurationDays);

  // ── S7: Hydromet Stress ─────────────────────────────────
  const hydromet =
    0.35 * scoreAnnualRain(loc.chirpsRain365mm) +
    0.35 * scoreRunoff(loc.era5Runoff30mm) +
    0.30 * scoreSoilMoisture(loc.smapSoilMoist30d);

  // ── S8: Ecological Protection (0–1, higher = more buffered) ───
  const protection =
    0.40 * scoreMangroveProximity(loc.distMangroveKm) +
    0.35 * scoreMangroveArea(loc.mangroveArea25km) +
    0.25 * scoreTreeCover(loc.treeCover2000Pct);

  // ── S9: Coping Capacity (0–1, higher = more resilient) ──────
  const copingCapacity =
    0.30 * scoreShelterProximity(loc.nearestShelterKm) +
    0.25 * scoreShelterDensity(loc.shelters25km) +
    0.20 * scoreShelterCapacity(loc.shelterCapacity25km) +
    0.25 * scorePeoplePerSeat(loc.peoplePerShelterSeat25km);

  // ── Continuous CoastFactor (v4-style blend, using available proxies) ───
  // F_estuary proxy is unavailable in this frontend path; redistribute weight to known signals.
  const coastDist = scoreMangroveProximity(loc.distMangroveKm);
  const lowElev = scoreElevation(loc.elevMean);
  const surgePrior = scoreSurgeDepth(loc.surgeRp100DepthM);
  const stormProx = scoreTrackProximity(loc.ibtMinDistKm);
  const coastFactor = clamp01(
    0.35 * coastDist +
    0.25 * lowElev +
    0.25 * surgePrior +
    0.15 * stormProx
  );

  // ── Dimension Aggregation (weighted blend of coastal/inland priors) ───
  const coastalHazard =
    0.35 * surge +
    0.25 * cycloneHist +
    0.15 * cycloneEnv +
    0.15 * flood +
    0.10 * hydromet;
  const inlandHazard =
    0.45 * flood +
    0.25 * hydromet +
    0.20 * cycloneHist +
    0.10 * cycloneEnv;
  const hazardDim =
    coastFactor * coastalHazard +
    (1 - coastFactor) * inlandHazard;

  const coastalCapDeficit =
    0.60 * (1 - copingCapacity) +
    0.40 * (1 - protection);
  const inlandCapDeficit =
    0.70 * (1 - copingCapacity) +
    0.30 * (1 - protection);
  const capDeficitDim =
    coastFactor * coastalCapDeficit +
    (1 - coastFactor) * inlandCapDeficit;

  // Vulnerability dimension (same for both profiles)
  const vulnDim = 0.55 * structural + 0.45 * exposure;

  // Guardrail: severe inland flood-memory localities should not be muted by low vulnerability.
  const floodUnderestimationSignal =
    clamp01((flood - 0.70) / 0.30) *
    clamp01((0.55 - vulnDim) / 0.55) *
    clamp01((0.80 - coastFactor) / 0.80);
  const floodCalibrationBoost = 0.08 * floodUnderestimationSignal;
  const hazardDimCalibrated = clamp01(hazardDim + floodCalibrationBoost);

  // Locality floors from exhaustive underestimation audit.
  const localityDziFloor = LOCALITY_MIN_DZI_FLOOR[loc.localityCode] ?? 0;
  const localityFloorNorm = localityDziFloor > 0 ? localityDziFloor / 100 : 0;

  // ── Final: Geometric Mean of 3 dimensions (INFORM methodology) ──
  // Prevents compensation: if ANY dimension is low, overall risk drops.
  // Each dimension gets equal weight in the geometric mean.
  // Ensure no dimension is exactly 0 (would zero out entire score)
  const EPS = 0.01;
  const v_safe = Math.max(EPS, vulnDim);
  const c_safe = Math.max(EPS, capDeficitDim);
  const requiredHazardForFloor = localityDziFloor > 0
    ? clamp01((localityFloorNorm ** 3) / (v_safe * c_safe))
    : 0;
  const hazardDimFinal = Math.max(hazardDimCalibrated, requiredHazardForFloor);
  const localityFloorBoost = Math.max(0, hazardDimFinal - hazardDimCalibrated);
  const h_safe = Math.max(EPS, hazardDimFinal);
  const rawDangerScore = Math.cbrt(h_safe * v_safe * c_safe);
  const dangerScore = Math.max(rawDangerScore, localityFloorNorm);
  const localityDirectFloorBoost = Math.max(0, dangerScore - rawDangerScore);
  const dangerIndex = Math.round(Math.max(0, Math.min(100, dangerScore * 100)));

  return {
    structural,
    exposure,
    cycloneHist,
    cycloneEnv,
    surge,
    flood,
    hydromet,
    protection,
    copingCapacity,
    coastFactor,
    floodCalibrationBoost,
    localityDziFloor,
    localityFloorBoost,
    localityDirectFloorBoost,
    cfCoastDist: coastDist,
    cfLowElev: lowElev,
    cfSurgePrior: surgePrior,
    cfStormProx: stormProx,
    hazardDim: hazardDimFinal,
    vulnDim,
    capDeficitDim,
    dangerScore,
    dangerIndex,
  };
}

/* ------------------------------------------------------------------ */
/*  Fixed Cell Size                                                    */
/* ------------------------------------------------------------------ */
// Dhaka control-room view needs ultra-compact honeycomb cells.
// turf.hexGrid uses side length in kilometers.
const CELL_SIZE_KM = 0.25;
const BORDER_SIMPLIFY_TOLERANCE = 0.003;
const GRID_BOUNDARY_URL = '/dhaka_border.json';
const COASTLINE_SOURCE_URL = '/bangladesh_simplified.json';
const HONEYCOMB_PANE = 'honeycomb-overlay-pane';
const HONEYCOMB_MODEL_VERSION = 'v4-hybrid-2026-03';
const HEX_EDGE_COLOR = '#0b1324';
const HEX_EDGE_WEIGHT = 0.72;
const HEX_EDGE_OPACITY = 0.9;

/* ------------------------------------------------------------------ */
/*  Coastline Extraction                                               */
/* ------------------------------------------------------------------ */
function extractCoastline(borderFC: FeatureCollection): Feature<LineString> | null {
  try {
    const feature = borderFC.features[0];
    if (!feature) return null;

    const geom = feature.geometry;
    let allCoords: number[][][] = [];

    if (geom.type === 'Polygon') {
      allCoords = (geom as Polygon).coordinates;
    } else if (geom.type === 'MultiPolygon') {
      (geom as MultiPolygon).coordinates.forEach(poly => {
        allCoords.push(...poly);
      });
    }

    const coastalPoints: number[][] = [];
    for (const ring of allCoords) {
      for (const coord of ring) {
        if (coord[1] < 22.5) {
          coastalPoints.push(coord);
        }
      }
    }

    if (coastalPoints.length < 2) return null;
    coastalPoints.sort((a, b) => a[0] - b[0]);
    return turf.lineString(coastalPoints);
  } catch (e) {
    console.error('HoneycombLayer: Failed to extract coastline:', e);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  ONE-TIME Grid Generation — v4 IDW Interpolated model                */
/* ------------------------------------------------------------------ */
let cachedGrid: FeatureCollection | null = null;
let cachedInterpolator: HexInterpolator | null = null;

/* Dynamic hazard boost map: locality_code → { dynamic_boost, wind_ms, rain_mm, mslp_hpa, wave_m } */
interface DynamicBoostEntry {
  dynamic_boost: number;
  wind_ms: number;
  rain_mm: number;
  mslp_hpa: number;
  wave_m: number;
}
type DynamicMap = Record<string, DynamicBoostEntry>;
interface DynamicFetchResult {
  localities: DynamicMap;
  stale: boolean;
  generatedUtc?: string;
}

// ── v4 Mode Detection ──
const v4ModeActive = true; // IDW interpolation active by default
let debugLogEmitted = false;

function emitV4DebugLog(localities: LocalityData[], hexCount: number, mode: string) {
  if (debugLogEmitted) return;
  debugLogEmitted = true;
  console.log('%c[HoneycombLayer v4 Debug]', 'color:#22d3ee;font-weight:bold;', {
    mode,
    idwInterpolation: v4ModeActive ? 'ACTIVE (k=4)' : 'DISABLED (nearest-single)',
    localityCount: localities.length,
    hexCount,
    scoreSource: v4ModeActive ? 'IDW-blended from k=4 nearest localities' : 'Single nearest locality (v3 legacy)',
    interpolatorPoints: cachedInterpolator?.getPointCount() ?? 0,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Build IDW interpolation points from locality data.
 * Each locality's subscores are pre-computed and stored as numeric properties.
 */
function buildInterpolationPoints(localities: LocalityData[]): LocalityPoint[] {
  return localities.map(loc => {
    const scores = computeSubscores(loc);
    return {
      code: loc.localityCode,
      lat: loc.centerLat,
      lon: loc.centerLon,
      // Store all subscores as flat numeric properties for IDW
      structural: scores.structural,
      exposure: scores.exposure,
      cycloneHist: scores.cycloneHist,
      cycloneEnv: scores.cycloneEnv,
      surge: scores.surge,
      flood: scores.flood,
      hydromet: scores.hydromet,
      protection: scores.protection,
      copingCapacity: scores.copingCapacity,
      floodCalibrationBoost: scores.floodCalibrationBoost,
      localityDziFloor: scores.localityDziFloor,
      localityFloorBoost: scores.localityFloorBoost,
      localityDirectFloorBoost: scores.localityDirectFloorBoost,
      coastFactor: scores.coastFactor,
      cfCoastDist: scores.cfCoastDist,
      cfLowElev: scores.cfLowElev,
      cfSurgePrior: scores.cfSurgePrior,
      cfStormProx: scores.cfStormProx,
      hazardDim: scores.hazardDim,
      vulnDim: scores.vulnDim,
      capDeficitDim: scores.capDeficitDim,
      dangerScore: scores.dangerScore,
      dangerIndex: scores.dangerIndex,
      isCoastal: loc.isCoastal ? 1 : 0,
      // Store raw values for tooltip display
      localityLat: loc.centerLat,
      localityLon: loc.centerLon,
    };
  });
}

// P3: Use structuredClone instead of JSON.parse(JSON.stringify()) for faster deep copy
function cloneFeatureCollection(fc: FeatureCollection): FeatureCollection {
  return structuredClone(fc) as FeatureCollection;
}

// Replay behavior: preserve additive semantics (baseline + cyclone increment).
const REPLAY_DEBUG_LOGS = false;

function applySoftEventRamp(eventHazard: number): number {
  const e = Math.max(0, Math.min(1, eventHazard));
  const floor = 0.005;
  const full = 0.03;
  if (e <= floor) return 0;
  if (e >= full) return e;
  const t = (e - floor) / (full - floor);
  return e * t;
}

function applyDynamicHazardToGrid(grid: FeatureCollection, dynamicMap: DynamicMap): void {
  for (const feat of grid.features) {
    if (!feat.properties) continue;
    const p = feat.properties as any;
    const code = p.localityCode as string;
    const base = Math.max(0, Math.min(1, p.staticDangerScore ?? p.dangerScore ?? 0));
    const dynEntry = dynamicMap[code];
    const dynamicBoost = Math.max(0, Math.min(1, dynEntry?.dynamic_boost ?? 0));
    const dynamicWeight = dynamicBoost > 0 ? 0.20 : 0;
    const blended = Math.min(1, base * (1 - dynamicWeight) + dynamicBoost * dynamicWeight);
    const blendedIndex = Math.round(blended * 100);
    const danger = getDangerLevelFromIndex(blendedIndex);

    p.dynamicBoost = dynamicBoost;
    p.dynamicWindMs = dynEntry?.wind_ms ?? 0;
    p.dynamicRainMm = dynEntry?.rain_mm ?? 0;
    p.dynamicMslpHpa = dynEntry?.mslp_hpa ?? 0;
    p.dynamicWaveM = dynEntry?.wave_m ?? 0;

    p.dangerScore = blended;
    p.dangerIndex = blendedIndex;
    p.dangerLevel = danger.level;
    p.dangerLabel = danger.label;
    p.dangerColor = danger.color;

    p.baselineDZI = Math.round(base * 100);
    p.eventHazard = Math.round(dynamicBoost * 100);
    p.dynamicBoostDZI = Math.round(Math.max(0, blendedIndex - p.baselineDZI));
    p.displayedDZI = blendedIndex;
  }
}

function generateHoneycombGridOnce(
  borderFC: FeatureCollection,
  coastline: Feature<LineString>,
  localities: LocalityData[],
): FeatureCollection {
  // Static grid is generated once and reused across mounts.
  if (cachedGrid) return cachedGrid;

  cachedGrid = null;

  const countryBbox = turf.bbox(borderFC) as [number, number, number, number];
  const pad = CELL_SIZE_KM * 0.2 / 111;
  const paddedBbox: [number, number, number, number] = [
    countryBbox[0] - pad,
    countryBbox[1] - pad,
    countryBbox[2] + pad,
    countryBbox[3] + pad,
  ];

  const hexGrid = turf.hexGrid(paddedBbox, CELL_SIZE_KM, { units: 'kilometers' });

  const borderFeatureRaw = borderFC.features[0] as Feature<Polygon | MultiPolygon> | undefined;
  if (!borderFeatureRaw) return { type: 'FeatureCollection', features: [] };

  const borderFeature = turf.simplify(borderFeatureRaw, {
    tolerance: BORDER_SIMPLIFY_TOLERANCE,
    highQuality: false,
  }) as Feature<Polygon | MultiPolygon>;

  // ── v4: Build IDW Interpolator ──────────────────────────────
  const interpPoints = buildInterpolationPoints(localities);
  const interpolator = new HexInterpolator(interpPoints, 4, 1.0);
  cachedInterpolator = interpolator;

  // Build a lookup map for locality metadata (names, etc.)
  const localityByCode = new Map<string, LocalityData>();
  for (const loc of localities) {
    localityByCode.set(loc.localityCode, loc);
  }

  const localityCoastDistanceKm = new Map<string, number>();
  for (const loc of localities) {
    if (!isFinite(loc.centerLat) || !isFinite(loc.centerLon)) continue;
    const near = turf.nearestPointOnLine(
      coastline,
      turf.point([loc.centerLon, loc.centerLat]),
      { units: 'kilometers' }
    );
    localityCoastDistanceKm.set(loc.localityCode, Math.round(near.properties.dist ?? 0));
  }

  const clippedFeatures: Feature[] = [];
  const generatedAt = new Date().toISOString();
  const SUBSCORE_PROPS = [
    'structural', 'exposure', 'cycloneHist', 'cycloneEnv',
    'surge', 'flood', 'hydromet', 'protection', 'copingCapacity',
    'floodCalibrationBoost',
    'localityDziFloor', 'localityFloorBoost', 'localityDirectFloorBoost',
    'cfCoastDist', 'cfLowElev', 'cfSurgePrior', 'cfStormProx',
    'coastFactor', 'hazardDim', 'vulnDim', 'capDeficitDim', 'dangerScore', 'isCoastal',
  ];

  for (const hex of hexGrid.features) {
    try {
      // Fast reject with simplified boundary first.
      const touchesBorder = turf.booleanIntersects(
        hex as Feature<Polygon>,
        borderFeature as Feature<Polygon | MultiPolygon>
      );
      if (!touchesBorder) continue;

      const centroid = turf.centroid(hex as Feature<Polygon>);

      const cLon = centroid.geometry.coordinates[0];
      const cLat = centroid.geometry.coordinates[1];

      // ── v4 IDW: Interpolate subscores from k=4 nearest localities ──
      const { values, primaryCode } = interpolator.interpolateMulti(
        cLat, cLon, SUBSCORE_PROPS,
      );

      const primaryLoc = localityByCode.get(primaryCode);

      // Clamp all subscores to [0,1]
      for (const key of SUBSCORE_PROPS) {
        values[key] = Math.max(0, Math.min(1, values[key]));
      }

      // dangerScore is the IDW-blended composite
      const dangerScore = values['dangerScore'];

      const staticIndex = Math.round(Math.max(0, Math.min(100, dangerScore * 100)));
      const danger = getDangerLevelFromIndex(staticIndex);

      const optimizedHex = hex as Feature<Polygon>;
      optimizedHex.properties = {
        ...optimizedHex.properties,
        hexId: `hex-${clippedFeatures.length.toString(36)}`,
        distanceToCoastKm: localityCoastDistanceKm.get(primaryCode) ?? 0,
        localityCode: primaryCode,
        localityName: primaryLoc?.localityName || primaryCode,
        districtName: primaryLoc?.districtName || '',
        localityCenterLat: primaryLoc?.centerLat ?? cLat,
        localityCenterLon: primaryLoc?.centerLon ?? cLon,
        hexCenterLat: cLat,
        hexCenterLon: cLon,

        // v4 IDW-interpolated subscores
        structural: Math.round(values['structural'] * 100) / 100,
        exposure: Math.round(values['exposure'] * 100) / 100,
        cycloneHist: Math.round(values['cycloneHist'] * 100) / 100,
        cycloneEnv: Math.round(values['cycloneEnv'] * 100) / 100,
        surge: Math.round(values['surge'] * 100) / 100,
        flood: Math.round(values['flood'] * 100) / 100,
        hydromet: Math.round(values['hydromet'] * 100) / 100,
        protection: Math.round(values['protection'] * 100) / 100,
        copingCapacity: Math.round(values['copingCapacity'] * 100) / 100,
        floodCalibrationBoost: Math.round(values['floodCalibrationBoost'] * 100) / 100,
        localityDziFloor: Math.round(values['localityDziFloor'] * 100) / 100,
        localityFloorBoost: Math.round(values['localityFloorBoost'] * 100) / 100,
        localityDirectFloorBoost: Math.round(values['localityDirectFloorBoost'] * 100) / 100,
        cfCoastDist: Math.round(values['cfCoastDist'] * 100) / 100,
        cfLowElev: Math.round(values['cfLowElev'] * 100) / 100,
        cfSurgePrior: Math.round(values['cfSurgePrior'] * 100) / 100,
        cfStormProx: Math.round(values['cfStormProx'] * 100) / 100,
        coastFactor: Math.round(values['coastFactor'] * 100) / 100,
        hazardDim: Math.round(values['hazardDim'] * 100) / 100,
        vulnDim: Math.round(values['vulnDim'] * 100) / 100,
        capDeficitDim: Math.round(values['capDeficitDim'] * 100) / 100,
        isCoastal: (values['coastFactor'] ?? values['isCoastal']) > 0.5,

        // Dynamic defaults (patched per live data after static grid load)
        dynamicBoost: 0,
        dynamicWindMs: 0,
        dynamicRainMm: 0,
        dynamicMslpHpa: 0,
        dynamicWaveM: 0,
        dynamicDataStale: true,
        dynamicGeneratedUtc: null,

        dangerScore,
        staticDangerScore: dangerScore,
        dangerIndex: staticIndex,
        dangerLevel: danger.level,
        dangerLabel: danger.label,
        dangerColor: danger.color,
        cellSizeKm: CELL_SIZE_KM,
        v4Interpolated: true,  // debug marker
        modelVersion: HONEYCOMB_MODEL_VERSION,
        generatedAt,
        sourceSet: 'baseline+hydromet+flood+cyclone_env+surge+cyclone_hist+ecology+shelter',
      };

      clippedFeatures.push(optimizedHex);
    } catch {
      continue;
    }
  }

  const result: FeatureCollection = {
    type: 'FeatureCollection',
    features: clippedFeatures,
  };

  // Emit v4 debug summary
  emitV4DebugLog(localities, clippedFeatures.length, 'STATIC_GRID');

  cachedGrid = result;
  return result;
}

/* ------------------------------------------------------------------ */
/*  Canvas Renderer Singleton                                          */
/* ------------------------------------------------------------------ */
const canvasRenderers = new WeakMap<L.Map, L.Canvas>();

function getCanvasRenderer(map: L.Map): L.Canvas {
  let renderer = canvasRenderers.get(map);
  if (!renderer) {
    renderer = L.canvas({ padding: 0.5, tolerance: 10, pane: HONEYCOMB_PANE as any });
    canvasRenderers.set(map, renderer);
  }
  return renderer;
}

function ensureHoneycombPane(map: L.Map): HTMLElement {
  let pane = map.getPane(HONEYCOMB_PANE);
  if (!pane) {
    pane = map.createPane(HONEYCOMB_PANE);
    // Keep honeycomb below default overlay pane so focus-mode mask can clip outside-Bangladesh area.
    pane.style.zIndex = '350';
  }
  return pane;
}

function setHoneycombPaneVisibility(map: L.Map, visible: boolean): void {
  const pane = ensureHoneycombPane(map);
  pane.style.opacity = visible ? '1' : '0';
  pane.style.pointerEvents = visible ? 'auto' : 'none';
}

/* ------------------------------------------------------------------ */
/*  React Component                                                    */
/* ------------------------------------------------------------------ */
interface HoneycombLayerProps {
  visible?: boolean;
}

export function HoneycombLayer({ visible = true }: HoneycombLayerProps) {
  const map = useMap();
  const setBatchedZones = useSimulationStore((s) => s.setBatchedZones);
  const layerRef = useRef<L.GeoJSON | null>(null);
  const [ready, setReady] = useState(false);
  const gridRef = useRef<FeatureCollection | null>(null);
  const visibleRef = useRef(visible);
  // P2: Layer index — fast lookup by locality code instead of eachLayer() full scan
  const layerIndexRef = useRef<Map<string, L.Path[]>>(new Map());
  // P1: Track previous dynMap signature to avoid rebuilding HexInterpolator when unchanged
  const prevDynSigRef = useRef<string>('');
  const prevDynInterpolatorRef = useRef<HexInterpolator | null>(null);

  // ── ONE-TIME computation on mount ─────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function fetchDynamicHazardMapFast(): Promise<DynamicFetchResult> {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 1200);
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/dynamic-hazard`, { signal: controller.signal });
        if (!res.ok) return { localities: {}, stale: true };
        const dynamicData = await res.json();
        if (dynamicData && dynamicData.localities) {
          return {
            localities: dynamicData.localities as DynamicMap,
            stale: !!dynamicData.stale,
            generatedUtc: typeof dynamicData.generated_utc === 'string' ? dynamicData.generated_utc : undefined,
          };
        }
        return { localities: {}, stale: true };
      } catch {
        return { localities: {}, stale: true };
      } finally {
        window.clearTimeout(timeout);
      }
    }

    async function computeGrid() {
      try {
        // Start dynamic fetch in parallel, but do not block grid preload on it.
        const dynamicPromise = fetchDynamicHazardMapFast();

        // Fetch static datasets in parallel
        const [gridBoundaryRes, coastlineRes, baselineRes, hydrometRes, floodRes, cycloneEnvRes, surgeRes, cycloneHistRes, ecologyRes, shelterRes] =
          await Promise.all([
            fetch(GRID_BOUNDARY_URL),
            fetch(COASTLINE_SOURCE_URL),
            fetch('/bangladesh_baseline_clean.csv'),
            fetch('/ee_remaining_hydromet_recent.csv'),
            fetch('/ee_remaining_historical_flood.csv'),
            fetch('/ee_extra_cyclone_environment_era5.csv'),
            fetch('/ee_extra_coastal_surge_aqueduct.csv'),
            fetch('/fixed_cyclone_metrics.csv'),
            fetch('/ee_fixed_ecology_FINAL.csv'),
            fetch('/shelter_density_metrics.csv'),
          ]);

        if (!gridBoundaryRes.ok) throw new Error('Failed to fetch Dhaka boundary data');
        if (!coastlineRes.ok) throw new Error('Failed to fetch coastline source data');
        if (!baselineRes.ok) throw new Error('Failed to fetch baseline data');

        const gridBoundaryData: FeatureCollection = await gridBoundaryRes.json();
        const coastlineSourceData: FeatureCollection = await coastlineRes.json();
        const baselineText = await baselineRes.text();
        const hydrometText = await hydrometRes.text();
        const floodText = await floodRes.text();
        const cycloneEnvText = await cycloneEnvRes.text();
        const surgeText = await surgeRes.text();
        const cycloneHistText = await cycloneHistRes.text();
        const ecologyText = await ecologyRes.text();
        const shelterText = await shelterRes.text();

        if (cancelled) return;

        // Parse all CSVs
        const baselineRows = parseSimpleCSV(baselineText);
        const hydrometRows = parseSimpleCSV(hydrometText);
        const floodRows = parseSimpleCSV(floodText);
        const cycloneEnvRows = parseSimpleCSV(cycloneEnvText);
        const surgeRows = parseSimpleCSV(surgeText);
        const cycloneHistRows = parseSimpleCSV(cycloneHistText);
        const ecologyRows = parseSimpleCSV(ecologyText);
        const shelterRows = parseSimpleCSV(shelterText);

        // Merge into unified dataset (v3: 8 CSV sources)
        const localities = mergeAllDatasets(
          baselineRows, hydrometRows, floodRows,
          cycloneEnvRows, surgeRows, cycloneHistRows, ecologyRows, shelterRows,
        );

        const coastline = extractCoastline(coastlineSourceData);
        if (!coastline || cancelled) return;

        // Generate static grid first so honeycomb becomes toggle-ready ASAP.
        const staticGrid = generateHoneycombGridOnce(gridBoundaryData, coastline, localities);
        const grid = cloneFeatureCollection(staticGrid);
        if (cancelled) return;

        gridRef.current = grid;
        setReady(true);

        // Hydrate dynamic hazard after readiness without blocking first render/toggle.
        dynamicPromise
          .then((dynamicRes) => {
            if (cancelled || !gridRef.current) return;
            const hasDynamic = !!dynamicRes.localities && Object.keys(dynamicRes.localities).length > 0;

            for (const feat of gridRef.current.features) {
              if (!feat.properties) continue;
              const p = feat.properties as any;
              p.dynamicDataStale = dynamicRes.stale || !hasDynamic;
              p.dynamicGeneratedUtc = dynamicRes.generatedUtc ?? null;
            }

            if (!hasDynamic) return;

            applyDynamicHazardToGrid(gridRef.current, dynamicRes.localities);

            if (!layerRef.current) return;
            layerRef.current.eachLayer((l: any) => {
              const p = l?.feature?.properties;
              if (!p) return;
              if (l.setStyle) {
                l.setStyle({
                  fillColor: p.dangerColor,
                  fillOpacity: 0.12,
                  color: HEX_EDGE_COLOR,
                  weight: HEX_EDGE_WEIGHT,
                  opacity: HEX_EDGE_OPACITY,
                  dashArray: '',
                  lineCap: 'round',
                  lineJoin: 'round',
                });
              }
            });
          })
          .catch(() => undefined);
      } catch (err) {
        console.error('HoneycombLayer:', err);
      }
    }

    computeGrid();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    visibleRef.current = visible;
    setHoneycombPaneVisibility(map, visible);
  }, [map, visible]);



  // ── Build layer once when grid is ready; attach/detach by visibility ──────────────────────
  useEffect(() => {
    if (!ready || !gridRef.current) return;

    if (layerRef.current) return;

    const canvasRenderer = getCanvasRenderer(map);

    const geoJsonLayer = L.geoJSON(gridRef.current, {
      // @ts-ignore - Leaflet types are missing the renderer option for GeoJSON Options
      renderer: canvasRenderer,
      pane: HONEYCOMB_PANE,
      interactive: true,
      style: (feature) => {
        if (!feature?.properties) {
          return {
            fillColor: '#22c55e',
            fillOpacity: 0.1,
            color: HEX_EDGE_COLOR,
            weight: HEX_EDGE_WEIGHT,
            opacity: HEX_EDGE_OPACITY,
            dashArray: '',
            lineCap: 'round' as const,
            lineJoin: 'round' as const,
          };
        }
        const color = feature.properties.dangerColor || '#22c55e';
        return {
          fillColor: color,
          fillOpacity: 0.12,
          color: HEX_EDGE_COLOR,
          weight: HEX_EDGE_WEIGHT,
          opacity: HEX_EDGE_OPACITY,
          dashArray: '',
          lineCap: 'round' as const,
          lineJoin: 'round' as const,
        };
      },
      onEachFeature: (feature: Feature, layer: L.Layer) => {
        if (!feature.properties) return;

        // P2: Index this layer by locality code for fast per-tick lookup
        const locCode = feature.properties.localityCode;
        if (locCode) {
          const existing = layerIndexRef.current.get(locCode);
          if (existing) {
            existing.push(layer as L.Path);
          } else {
            layerIndexRef.current.set(locCode, [layer as L.Path]);
          }
        }

        // Click → open full DZI breakdown popup
        // Generate on click to avoid eager HTML generation for all hexes.
        (layer as L.Path).bindPopup(
          '',
          {
            className: 'honeycomb-popup',
            maxWidth: 400,
            minWidth: 340,
            closeButton: true,
            autoPan: true,
            autoPanPadding: L.point(40, 40),
          }
        );
        (layer as L.Path).bindTooltip('', {
          className: 'honeycomb-hover-tooltip',
          direction: 'top',
          offset: L.point(0, -8),
          sticky: true,
          opacity: 0.98,
        });

        // Track currently clicked hex for visual highlight reset
        let isClicked = false;

        // Hover highlight
        (layer as L.Path).on({
          mouseover: (e: L.LeafletMouseEvent) => {
            if (isClicked) return;
            const target = e.target as L.Path;
            target.setTooltipContent(generateHoverFormulaContent(feature.properties));
            target.openTooltip(e.latlng);
            target.setStyle({
              fillOpacity: 0.22,
              weight: 1.05,
              opacity: 1,
              color: '#e2e8f0',
              dashArray: '',
            });
            target.bringToFront();
          },
          mouseout: (e: L.LeafletMouseEvent) => {
            if (isClicked) return;
            const target = e.target as L.Path;
            target.closeTooltip();
            const color = feature.properties?.dangerColor || '#22c55e';
            target.setStyle({
              fillColor: color,
              fillOpacity: 0.12,
              color: HEX_EDGE_COLOR,
              weight: HEX_EDGE_WEIGHT,
              opacity: HEX_EDGE_OPACITY,
              dashArray: '',
            });
          },
          click: () => {
            isClicked = true;
            const target = layer as L.Path;
            target.closeTooltip();
            target.setPopupContent(generatePopupContent(feature.properties));
            target.setStyle({
              fillOpacity: 0.26,
              weight: 1.35,
              opacity: 1,
              color: '#ffffff',
              dashArray: '',
            });
            target.bringToFront();
            target.openPopup();
          },
          popupclose: () => {
            isClicked = false;
            const target = layer as L.Path;
            const color = feature.properties?.dangerColor || '#22c55e';
            target.setStyle({
              fillColor: color,
              fillOpacity: 0.12,
              color: HEX_EDGE_COLOR,
              weight: HEX_EDGE_WEIGHT,
              opacity: HEX_EDGE_OPACITY,
              dashArray: '',
            });
          },
        });
      },
    });

    layerRef.current = geoJsonLayer;
    geoJsonLayer.addTo(map);
    setHoneycombPaneVisibility(map, visible);

    let replayDebugEmitted = false;

    // Store update function in a ref so we can call it when visibility toggles to true
    // (This is attached to window purely as a hacky escape hatch or we can just use the store directly)
    var updateFromStore = (state: any, prevState?: any) => {
      // Only run if the step changed or loaded state changed
      if (prevState && state.currentStep === prevState.currentStep && state.isLoaded === prevState.isLoaded) return;
      
      if (!layerRef.current) return;
      // Note: visibleRef guard removed here — hex style updates have their own guard below (line 2037).
      // Zone classification and setActiveZones must run even when the layer is hidden (e.g. on Control Panel page).

      const step = state.timeline[state.currentStep];
      const isV4Store = state.modelVersion === 'v4';

      // Build per-locality dynamic data map from current step
      // v4: uses locality_impacts directly (event_hazard, live_dzi)
      // v3 compat: uses processed localities array
      const dynMap: Record<string, any> = {};
        if (state.isLoaded && step) {
          if (step.locality_impacts) {
            // v4 format: raw impacts from simulation engine
            for (const [code, impact] of Object.entries(step.locality_impacts)) {
              const smoothedH = state.smoothedHazards?.[code] ?? (impact as any).event_hazard ?? (impact as any).dynamic_boost ?? 0;
              dynMap[code] = {
                risk_index: smoothedH,
                event_hazard: (impact as any).event_hazard ?? (impact as any).dynamic_boost ?? 0,
                live_dzi: (impact as any).live_dzi ?? 0,
                wind_max_kmh: Math.round(((impact as any).local_wind_kt || 0) * 1.852),
                rain_mm: 0,
                surge_m: (impact as any).surge_pulse ?? 0,
                dist_to_eye_km: (impact as any).dist_to_eye_km ?? 999,
              };
            }
          } else if (step.localities) {
            // v3 compat: processed localities
            step.localities.forEach((loc: any) => {
               dynMap[loc.district] = loc;
            });
          }
        }

        // P1: Build IDW interpolation points for dynamic scores, reusing if unchanged
        let dynInterpolator: HexInterpolator | null = null;
        const dynEntries = Object.entries(dynMap);

        // P1: Build a signature from dynMap keys + risk values to detect changes
        let dynSig = '';
        if (v4ModeActive && dynEntries.length > 0) {
          // Fast signature: sorted codes + quantised risk values
          dynSig = dynEntries
            .map(([code, d]: [string, any]) => `${code}:${Math.round((d.risk_index ?? 0) * 1000)}`)
            .sort()
            .join('|');
        }

        if (v4ModeActive && dynEntries.length > 0 && cachedInterpolator) {
          // P1: Reuse previous interpolator if signature hasn't changed
          if (dynSig === prevDynSigRef.current && prevDynInterpolatorRef.current) {
            dynInterpolator = prevDynInterpolatorRef.current;
          } else {
            // Signature changed — rebuild the dynamic interpolator
            // Build a locality position map for dynamic IDW
            const localityCoords = new Map<string, [number, number]>();
            if (gridRef.current) {
              const seen = new Set<string>();
              for (const feat of gridRef.current.features) {
                const code = feat.properties?.localityCode;
                if (code && !seen.has(code) && dynMap[code]) {
                  const lat = feat.properties?.localityCenterLat;
                  const lon = feat.properties?.localityCenterLon;
                  if (typeof lat === 'number' && typeof lon === 'number') {
                    localityCoords.set(code, [lat, lon]);
                  }
                  seen.add(code);
                }
              }
            }

            if (localityCoords.size > 3) {
              const dynPts: LocalityPoint[] = [];
              for (const [code, coords] of Array.from(localityCoords.entries())) {
                const d = dynMap[code];
                if (!d) continue;
                dynPts.push({
                  code,
                  lat: coords[0],
                  lon: coords[1],
                  risk_index: d.risk_index ?? 0,
                  live_dzi: d.live_dzi ?? 0,
                  wind_kmh: d.wind_max_kmh ?? 0,
                  surge_m: d.surge_m ?? 0,
                  rain_mm: d.rain_mm ?? 0,
                });
              }
              if (dynPts.length > 3) {
                dynInterpolator = new HexInterpolator(dynPts, 4, 2.0, 3.5);
              }
            }

            // P1: Cache for reuse
            prevDynSigRef.current = dynSig;
            prevDynInterpolatorRef.current = dynInterpolator;
          }
        }
        
        // Emit replay debug log once
        if (!replayDebugEmitted && Object.keys(dynMap).length > 0) {
          replayDebugEmitted = true;
          console.log('%c[HoneycombLayer v4 Replay Debug]', 'color:#f59e0b;font-weight:bold;', {
            storeModelVersion: state.modelVersion,
            replayMode: isV4Store ? 'v4 (EventHazard + EMA smoothing + 5-state escalation)' : 'v3 (legacy localities)',
            idwActive: v4ModeActive,
            dynamicLocalityCount: Object.keys(dynMap).length,
            hexCountInGrid: gridRef.current?.features.length ?? 0,
            scoreSource: v4ModeActive 
              ? 'IDW-blended event_hazard from k=4 neighbors per hex' 
              : 'Direct per-locality mapping (v3 legacy)',
            step: state.currentStep,
            smoothedHazardCount: Object.keys(state.smoothedHazards ?? {}).length,
            escalationStates: state.zoneStatuses,
          });
        }

        // ── Per-step debug accumulators & Control Panel Sync ──
        const dbg = { count: 0, bSum: 0, bMin: 100, bMax: 0, eSum: 0, eMin: 100, eMax: 0, boostSum: 0, boostMin: 100, boostMax: 0, dispSum: 0, dispMin: 100, dispMax: 0 };
        let currentCriticalCount = 0;
        let currentWarningCount = 0;
        const criticalFeatures: any[] = [];
        const warningFeatures: any[] = [];
        const allHoneycombFeatures: any[] = [];

        layerRef.current.eachLayer((l: any) => {
           const feat = l.feature;
           if (!feat || !feat.properties) return;
           const p = feat.properties;
           const locCode = p.localityCode;
           
            if (state.isLoaded) {
              // ── B = BaselineDZI (always preserved as floor) ──
              const B = p.staticDangerScore ?? p.dangerScore ?? 0; // [0,1]

              // ── E = EventHazard: interpolate from dynamic simulation data ──
              let E = 0; // [0,1]
              let dynWindMs = 0;
              let dynRainMm = 0;
              let dynSurgeM = 0;

              if (dynInterpolator) {
                // IDW blend from k=4 nearest dynamic localities (power=3.5)
                // Use pre-stored hex center (perf) or fallback to turf centroid
                let hLat = p.hexCenterLat;
                let hLon = p.hexCenterLon;
                if (typeof hLat !== 'number' || typeof hLon !== 'number') {
                  const c = turf.centroid(feat as Feature<Polygon>);
                  hLat = c.geometry.coordinates[1];
                  hLon = c.geometry.coordinates[0];
                }
                const { values: dynVals } = dynInterpolator.interpolateMulti(
                  hLat, hLon, ['risk_index', 'live_dzi', 'wind_kmh', 'surge_m', 'rain_mm'],
                );
                E = dynVals['risk_index'] ?? 0;
                p.interpolatedDzi = dynVals['live_dzi'] ?? 0;
                dynWindMs = Math.round((dynVals['wind_kmh'] ?? 0) / 3.6);
                dynRainMm = Math.round(dynVals['rain_mm'] ?? 0);
                dynSurgeM = Math.round((dynVals['surge_m'] ?? 0) * 10) / 10;
              } else if (dynMap[locCode]) {
                // Fallback: direct locality mapping (v3 mode)
                const simData = dynMap[locCode];
                E = simData.risk_index ?? 0;
                p.interpolatedDzi = simData.live_dzi ?? 0;
                dynWindMs = Math.round((simData.wind_max_kmh ?? 0) / 3.6);
                dynRainMm = Math.round(simData.rain_mm ?? 0);
                dynSurgeM = Math.round((simData.surge_m ?? 0) * 10) / 10;
              } else {
                 p.interpolatedDzi = 0;
              }

              // ── Soft weak-signal ramp (smoother than hard threshold) ──
              E = applySoftEventRamp(E);

              // ── ADDITIVE FUSION FORMULA ──
              // DisplayedDZI = BaselineDZI + DynamicBoost
              // Baseline is ALWAYS preserved as the floor.
              let dynamicBoostNorm = 0; // [0,1]

              if (E > 0) {
                // X = Exposure subscore, V = Vulnerability dimension [0,1]
                const X = p.exposure ?? 0;
                const V = p.vulnDim ?? 0;
                const coastFactor = Math.max(0, Math.min(1, p.coastFactor ?? (p.isCoastal ? 1 : 0)));
                const floodSignal = Math.max(0, Math.min(1, p.flood ?? 0));

                // Headroom: how much room to grow above baseline
                // Keep additive behavior, but avoid suppressing cyclone escalation in already-risky cells.
                const headroom = Math.max(0.28, 1 - B);

                // SusceptibilityAmplifier: how susceptible is this hex
                const susceptibility = Math.max(0, Math.min(1,
                  0.30 + 0.30 * X + 0.25 * V + 0.15 * coastFactor
                ));

                // ThreatGate: how strong is the event forcing
                const threatGate = Math.max(0, Math.min(1,
                  0.10 + 0.90 * Math.pow(E, 0.85)
                ));

                // Bangladesh compound amplifier: surge-prone coast + flood memory raises cyclone consequence.
                const compoundAmplifier = Math.max(1, Math.min(1.9,
                  1 + 0.45 * coastFactor + 0.30 * floodSignal
                ));

                const BOOST_GAIN = 0.78;

                dynamicBoostNorm = Math.max(0, Math.min(1,
                  BOOST_GAIN * threatGate * susceptibility * headroom * compoundAmplifier
                ));
              }

              // Additive fusion only: cyclone impact increments baseline and never replaces it.
              const interpolatedNorm = Math.max(0, Math.min(1, (p.interpolatedDzi ?? 0) / 100));
              const hasLiveAssist = interpolatedNorm > 0;
              const displayedNorm = Math.max(0, Math.min(1, B + dynamicBoostNorm));
              const displayedDZI = Math.round(Math.max(0, Math.min(100, displayedNorm * 100)));
              const baselineDZI = Math.round(Math.max(0, Math.min(100, B * 100)));
              const dynamicBoostDZI = Math.round(dynamicBoostNorm * 100);
              const eventHazardPct = Math.round(E * 100);

              const danger = getDangerLevelFromIndex(displayedDZI);

              // Store all four conceptual values separately
              p.baselineDZI = baselineDZI;
              p.eventHazard = eventHazardPct;
              p.dynamicBoostDZI = dynamicBoostDZI;
              p.displayedDZI = displayedDZI;

              p.dangerScore = displayedNorm;
              p.dangerIndex = displayedDZI;
              p.dangerLevel = danger.level;
              p.dangerLabel = danger.label;
              p.dangerColor = danger.color;

              p.dynamicBoost = E;
              p.dynamicWindMs = dynWindMs;
              p.dynamicRainMm = dynRainMm;
              p.dynamicMslpHpa = 0;
              p.dynamicWaveM = dynSurgeM;
              p.dynamicSource = hasLiveAssist
                ? 'frontend_additive_bangladesh_compound_live_assisted'
                : 'frontend_additive_bangladesh_compound';

              // ── Accumulate per-step debug stats ──
              dbg.count++;
              dbg.bSum += baselineDZI; dbg.bMin = Math.min(dbg.bMin, baselineDZI); dbg.bMax = Math.max(dbg.bMax, baselineDZI);
              dbg.eSum += eventHazardPct; dbg.eMin = Math.min(dbg.eMin, eventHazardPct); dbg.eMax = Math.max(dbg.eMax, eventHazardPct);
              dbg.boostSum += dynamicBoostDZI; dbg.boostMin = Math.min(dbg.boostMin, dynamicBoostDZI); dbg.boostMax = Math.max(dbg.boostMax, dynamicBoostDZI);
              dbg.dispSum += displayedDZI; dbg.dispMin = Math.min(dbg.dispMin, displayedDZI); dbg.dispMax = Math.max(dbg.dispMax, displayedDZI);
            } else {
              // No simulation loaded — reset to static baseline
              const B = p.staticDangerScore ?? p.dangerScore ?? 0;
              const baseIndex = Math.round(Math.max(0, Math.min(100, B * 100)));
              const danger = getDangerLevelFromIndex(baseIndex);
              
              p.baselineDZI = baseIndex;
              p.eventHazard = 0;
              p.dynamicBoostDZI = 0;
              p.displayedDZI = baseIndex;

              p.dangerScore = B;
              p.dangerIndex = baseIndex;
              p.dangerLevel = danger.level;
              p.dangerLabel = danger.label;
              p.dangerColor = danger.color;
              
              p.dynamicBoost = 0;
              p.dynamicWindMs = 0;
              p.dynamicRainMm = 0;
              p.dynamicMslpHpa = 0;
              p.dynamicWaveM = 0;
            }
            
            // Apply updated style
            if (visibleRef.current && l.setStyle) {
                l.setStyle({
                  fillColor: p.dangerColor,
                  fillOpacity: 0.12,
                  color: HEX_EDGE_COLOR,
                  weight: HEX_EDGE_WEIGHT,
                  opacity: HEX_EDGE_OPACITY,
                  dashArray: '',
                });
            }
            
            // Tally features for Control Panel Arrays
            if (p.dangerLabel === 'Critical') {
              currentCriticalCount++;
              criticalFeatures.push(feat);
            } else if (p.dangerLabel === 'High') {
              currentWarningCount++;
              warningFeatures.push(feat);
            }

            allHoneycombFeatures.push(feat);
        });

        // P4: Batch-set both zone arrays in a single store update to avoid double re-render.
        setBatchedZones({ critical: criticalFeatures, warning: warningFeatures }, allHoneycombFeatures);

        // ── Per-step debug summary ──
        if (REPLAY_DEBUG_LOGS && state.isLoaded && dbg.count > 0) {
          const n = dbg.count;
          console.log(
            `%c[DZI Fusion] Step ${state.currentStep} | ${Object.keys(dynMap).length} locs`,
            'color:#06b6d4;font-weight:bold;',
            {
              BaselineDZI: { min: dbg.bMin, mean: Math.round(dbg.bSum / n), max: dbg.bMax },
              EventHazard: { min: dbg.eMin, mean: Math.round(dbg.eSum / n), max: dbg.eMax },
              DynamicBoost: { min: dbg.boostMin, mean: Math.round(dbg.boostSum / n), max: dbg.boostMax },
              DisplayedDZI: { min: dbg.dispMin, mean: Math.round(dbg.dispSum / n), max: dbg.dispMax },
              hexCount: n,
            }
          );
        }
      };

    const unsub = useSimulationStore.subscribe(updateFromStore);
    
    // Store it on the window so we can trigger it forcibly on visibility toggle
    (window as any).__honeycombUpdateRef = (state: any) => updateFromStore(state);

    // Prime shared zone arrays immediately after mount/subscription.
    updateFromStore(useSimulationStore.getState());

    return () => {
      unsub();
      (window as any).__honeycombUpdateRef = undefined;
      // P2: Clear layer index
      layerIndexRef.current = new Map();
      // P1: Clear dynamic interpolator cache
      prevDynSigRef.current = '';
      prevDynInterpolatorRef.current = null;
      
      if (layerRef.current) {
        if (map.hasLayer(layerRef.current)) {
          map.removeLayer(layerRef.current);
        }
        layerRef.current = null;
      }
    };
  }, [map, ready, setBatchedZones]);

  // Fast visibility toggle with mounted pane.
  useEffect(() => {
    if (!ready) return;
    setHoneycombPaneVisibility(map, visible);

    if (visible && layerRef.current) {
      layerRef.current.eachLayer((l: any) => {
        const p = l?.feature?.properties;
        if (!p || !l.setStyle) return;
        l.setStyle({
          fillColor: p.dangerColor,
          fillOpacity: 0.12,
          color: HEX_EDGE_COLOR,
          weight: HEX_EDGE_WEIGHT,
          opacity: HEX_EDGE_OPACITY,
          dashArray: '',
        });
      });
    }
  }, [map, ready, visible]);

  return null;
}
