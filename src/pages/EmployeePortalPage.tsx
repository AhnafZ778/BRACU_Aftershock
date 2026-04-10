import { Bell, ClipboardCheck, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import './RolePortals.css';

export function EmployeePortalPage() {
  return (
    <div className="role-portal role-portal-employee">
      <aside className="rp-sidebar">
        <div className="rp-brand">
          <h1>Nirapotta Tasks</h1>
          <p>Employee Workspace</p>
        </div>

        <nav className="rp-nav" aria-label="Employee side navigation">
          <button className="is-active" type="button">
            Daily View
          </button>
          <button type="button">Team Hub</button>
          <button type="button">Assignments</button>
          <button type="button">History</button>
        </nav>

        <div className="rp-sidebar-footer">
          <Link to="/">Back to Landing</Link>
          <Link to="/customer">Customer Portal</Link>
        </div>
      </aside>

      <main className="rp-main">
        <header className="rp-topbar">
          <div className="rp-crumbs">
            <span>Nirapotta Watch</span>
            <span>Employee Desk</span>
            <span>Assignments</span>
          </div>

          <div className="rp-toolbar">
            <input className="rp-search" placeholder="Search assignment" />
            <button type="button" className="rp-icon-btn" aria-label="Search">
              <Search size={15} />
            </button>
            <button type="button" className="rp-icon-btn" aria-label="Alerts">
              <Bell size={15} />
            </button>
          </div>
        </header>

        <section>
          <p className="rp-inline-label">Active Task · District 7</p>
          <h2 className="rp-page-title">Home Visit & Cleaning</h2>
          <p className="rp-page-subtitle">
            Execute sanitation protocol and submit inspection results for assigned residential
            blocks before the next shift rotation.
          </p>
        </section>

        <section className="rp-content-grid">
          <div>
            <article className="rp-card">
              <p className="rp-inline-label">Assignment Detail</p>
              <div className="task-form">
                <input className="task-field" value="House 22, Hosque Way" readOnly />

                <div className="task-split">
                  <div>
                    <p className="rp-inline-label">Spray Count</p>
                    <div className="stepper" aria-label="Spray count stepper">
                      <button type="button">−</button>
                      <span>0</span>
                      <button type="button">+</button>
                    </div>
                  </div>

                  <div>
                    <p className="rp-inline-label">Cleaning Status</p>
                    <input className="task-field" value="Ready for review" readOnly />
                  </div>
                </div>
              </div>

              <div className="payment-card">
                <div>
                  <p className="rp-inline-label" style={{ color: 'rgba(244,240,232,0.7)' }}>
                    Collection Point
                  </p>
                  <h4>Collect Payment</h4>
                  <p className="payment-meta">
                    Payment is generated from approved service records. Secure transfer remains in
                    escrow until task verification.
                  </p>
                </div>

                <div className="payment-amount">
                  <p className="rp-inline-label" style={{ color: 'rgba(244,240,232,0.72)' }}>
                    Amount Due
                  </p>
                  <strong>45.00</strong>
                  <button type="button" className="rp-action">
                    Pay Card
                  </button>
                </div>
              </div>
            </article>
          </div>

          <div>
            <article className="rp-card">
              <p className="rp-inline-label">Location Context</p>
              <div className="location-shell" aria-hidden="true" />

              <h4 style={{ marginTop: '0.7rem' }}>22 Hosque Way, A4</h4>
              <p className="rp-page-subtitle" style={{ marginTop: '0.35rem' }}>
                14 City Ago <span className="rp-danger">Moderate</span>
              </p>

              <p className="rp-page-subtitle" style={{ marginTop: '0.7rem' }}>
                Previous note indicates standing-water pockets near rear drainage; re-inspection
                recommended after rainfall.
              </p>

              <button type="button" className="rp-action" style={{ marginTop: '0.95rem' }}>
                <ClipboardCheck size={14} /> Submit Task Record
              </button>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}