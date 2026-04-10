import { Bell, MapPinned, Search, ShieldAlert, Users2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import './RolePortals.css';

const zones = [
  { name: 'Old Quarter', ratio: '76%', eta: '4.6 Hours', impact: '0.89' },
  { name: 'Harbor East', ratio: '32%', eta: '2.0 Hours', impact: '0.45' },
];

const units = [
  { initials: 'MC', name: 'Marcus Chen', status: 'Operational · Unit A4', good: true },
  { initials: 'BR', name: 'Brea Rodriguez', status: 'Maintenance · Unit C2', good: false },
  { initials: 'JW', name: 'James Wu', status: 'Operational · Unit B6', good: true },
];

export function CustomerPortalPage() {
  return (
    <div className="role-portal role-portal-customer">
      <aside className="rp-sidebar">
        <div className="rp-brand">
          <h1>Nirapotta Control</h1>
          <p>Customer Operations</p>
        </div>

        <nav className="rp-nav" aria-label="Customer side navigation">
          <button className="is-active" type="button">
            Overview
          </button>
          <button type="button">Team Hub</button>
          <button type="button">Zones</button>
          <button type="button">Reports</button>
        </nav>

        <div className="rp-sidebar-footer">
          <Link to="/">Back to Landing</Link>
          <Link to="/admin">Admin Console</Link>
        </div>
      </aside>

      <main className="rp-main">
        <header className="rp-topbar">
          <div className="rp-crumbs">
            <span>Nirapotta Watch</span>
            <span>Field Operations</span>
            <span>Live Status</span>
          </div>

          <div className="rp-toolbar">
            <input className="rp-search" placeholder="Search zones or units" />
            <button type="button" className="rp-icon-btn" aria-label="Search">
              <Search size={15} />
            </button>
            <button type="button" className="rp-icon-btn" aria-label="Alerts">
              <Bell size={15} />
            </button>
          </div>
        </header>

        <section>
          <h2 className="rp-page-title">Field Operations</h2>
          <p className="rp-page-subtitle">
            Orchestrate and deploy field teams to high-risk areas using the current scenario
            projection and verified district telemetry.
          </p>
        </section>

        <section className="rp-content-grid">
          <div>
            <article className="rp-card">
              <p className="rp-inline-label">Critical Zones</p>
              <div className="zone-grid">
                {zones.map((zone) => (
                  <div className="zone-card" key={zone.name}>
                    <h4>{zone.name}</h4>
                    <div className="zone-line" />
                    <div className="zone-stats">
                      <span>{zone.ratio}</span>
                      <span>{zone.eta}</span>
                      <span>{zone.impact}</span>
                    </div>
                    <button className="rp-action" type="button">
                      <MapPinned size={13} /> Assign Unit
                    </button>
                  </div>
                ))}
              </div>

              <div className="rp-map-card">
                <p className="rp-inline-label">Field Telemetry</p>
                <h4>Zonal Environmental Analysis</h4>
                <p>
                  Temperature and humidity layers show accelerated mosquito risk in low-elevation
                  blocks. Tactical deployment window closes in 2 hours.
                </p>
              </div>
            </article>
          </div>

          <div>
            <article className="rp-card">
              <p className="rp-inline-label">Available Units</p>
              <div className="units-list">
                {units.map((unit) => (
                  <div className="unit-item" key={unit.name}>
                    <span className="unit-avatar">{unit.initials}</span>
                    <div>
                      <p className="unit-name">{unit.name}</p>
                      <p className={`unit-meta ${unit.good ? 'rp-good' : 'rp-danger'}`}>
                        {unit.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rp-coverage-card" aria-hidden="true" />

              <p className="rp-page-subtitle" style={{ marginTop: '0.6rem' }}>
                <Users2 size={14} style={{ marginRight: '0.35rem', verticalAlign: 'text-bottom' }} />
                Zone coverage is updating every 30 seconds.
              </p>
            </article>
          </div>
        </section>

        <section className="rp-card" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <ShieldAlert size={16} />
          <p className="rp-page-subtitle" style={{ margin: 0 }}>
            Alert provenance is signed from the admin broadcast desk before entering customer
            operations.
          </p>
        </section>
      </main>
    </div>
  );
}