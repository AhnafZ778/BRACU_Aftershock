import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  BriefcaseBusiness,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  Waves,
  Radar,
  Users2,
  Radio,
} from 'lucide-react';
import './LandingPage.css';

type Module = {
  title: string;
  detail: string;
};

type Principle = {
  title: string;
  detail: string;
  Icon: LucideIcon;
};

type LoginSegment = {
  title: string;
  detail: string;
  Icon: LucideIcon;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  toneClass: string;
};

const principles: Principle[] = [
  {
    title: 'Impact Forecasting',
    detail:
      'Convert cyclone data to block-level consequences before landfall, not after disruption.',
    Icon: Radar,
  },
  {
    title: 'Last-Mile Broadcast',
    detail:
      'Distribute localized alert packages through resilient channels where connectivity is fragile.',
    Icon: Radio,
  },
  {
    title: 'Coastal Readiness',
    detail:
      'Map surge exposure, shelter pressure, and evacuation priority with transparent assumptions.',
    Icon: Waves,
  },
];

const modules: Module[] = [
  {
    title: 'Scenario Studio',
    detail:
      'Run historical and synthetic cyclone tracks with role-specific response timing and package variants.',
  },
  {
    title: 'Response Ledger',
    detail:
      'Track which stations acknowledged, rebroadcast, and closed each warning cycle in real time.',
  },
  {
    title: 'Community Layer',
    detail:
      'Surface vulnerability context, shelter loads, and neighborhood communication gaps on one map.',
  },
];

const loginSegments: LoginSegment[] = [
  {
    title: 'Admin',
    detail:
      'Command access for district operators managing the main dashboard and the live broadcast desk.',
    Icon: ShieldCheck,
    primaryLabel: 'Open Dashboard',
    primaryHref: '/admin',
    secondaryLabel: 'Broadcast View',
    secondaryHref: '/broadcast-monitor',
    toneClass: 'segment-card-admin',
  },
  {
    title: 'Customer',
    detail:
      'Service-side operations view for zone coverage, unit availability, and field intelligence snapshots.',
    Icon: UserRound,
    primaryLabel: 'Open Customer Portal',
    primaryHref: '/customer',
    toneClass: 'segment-card-customer',
  },
  {
    title: 'Employee',
    detail:
      'Task-focused workspace for home visit execution, collection flow, and progress submission.',
    Icon: BriefcaseBusiness,
    primaryLabel: 'Open Employee Portal',
    primaryHref: '/employee',
    toneClass: 'segment-card-employee',
  },
];

export function LandingPage() {
  return (
    <div className="landing-page">
      <div className="landing-grain" aria-hidden="true" />

      <header className="landing-nav">
        <div className="landing-logo">
          <span className="landing-logo-mark" aria-hidden="true" />
          <span className="landing-logo-text">Nirapotta</span>
        </div>

        <nav className="landing-nav-links" aria-label="Primary navigation">
          <a href="#login">Login</a>
          <a href="#method">Method</a>
          <a href="#modules">Modules</a>
          <a href="#contact">Contact</a>
        </nav>

        <Link className="landing-nav-cta" to="/dashboard">
          Open Console
        </Link>
      </header>

      <main className="landing-main">
        <section className="hero-section">
          <div className="hero-grid">
            <div className="hero-copy reveal" style={{ animationDelay: '80ms' }}>
              <p className="eyebrow">Coastal Intelligence Platform</p>
              <h1>
                From risk maps to
                <br />
                local action.
              </h1>
              <p className="hero-lede">
                Nirapotta translates volatile weather data into curated, location-aware actions
                for officials, responders, and communities across Bangladesh.
              </p>

              <div className="hero-cta-row">
                <Link className="btn-primary" to="/admin">
                  Login as Admin
                </Link>
                <Link className="btn-secondary" to="/customer">
                  Login as Customer
                </Link>
                <a className="btn-secondary" href="#modules">
                  Explore Modules
                </a>
                <a className="btn-tertiary" href="#method">
                  Read Method
                </a>
              </div>
            </div>

            <div className="hero-aside reveal" style={{ animationDelay: '180ms' }}>
              <article className="hero-visual-card">
                <p className="hero-visual-label">Active Cyclone Scenario</p>
                <p className="hero-visual-title">Western Delta Surge Extreme</p>
                <p className="hero-visual-text">
                  Estimated 4.8 hours to severe impact. Alert package generation complete for 16
                  coastal unions.
                </p>
                <div className="hero-visual-meta">
                  <span>16 unions</span>
                  <span>7 channels</span>
                  <span>1 protocol</span>
                </div>
              </article>

              <div className="hero-facts-grid">
                <article className="hero-fact-card hero-fact-offset">
                  <p>Response Window</p>
                  <strong>4h 48m</strong>
                </article>
                <article className="hero-fact-card">
                  <p>Priority Shelters</p>
                  <strong>212</strong>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section id="login" className="landing-slab login-slab">
          <div className="slab-head reveal" style={{ animationDelay: '120ms' }}>
            <p className="eyebrow">Role Access</p>
            <h2>Login through the portal designed for your mission context.</h2>
          </div>

          <div className="login-segments-grid">
            {loginSegments.map((segment, index) => {
              const Icon = segment.Icon;
              return (
                <article
                  key={segment.title}
                  className={`segment-card ${segment.toneClass} reveal`}
                  style={{ animationDelay: `${220 + index * 100}ms` }}
                >
                  <div className="segment-head">
                    <span className="segment-icon">
                      <Icon size={20} strokeWidth={1.75} />
                    </span>
                    <h3>{segment.title}</h3>
                  </div>

                  <p>{segment.detail}</p>

                  <div className="segment-actions">
                    <Link className="btn-primary" to={segment.primaryHref}>
                      {segment.primaryLabel}
                      <ArrowRight size={15} />
                    </Link>

                    {segment.secondaryHref && segment.secondaryLabel ? (
                      <Link className="btn-secondary" to={segment.secondaryHref}>
                        {segment.secondaryLabel}
                      </Link>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section id="method" className="landing-slab landing-slab-soft">
          <div className="slab-head reveal" style={{ animationDelay: '120ms' }}>
            <p className="eyebrow">Architected Method</p>
            <h2>Three layers, one operational narrative.</h2>
          </div>

          <div className="principles-grid">
            {principles.map((item, index) => {
              const Icon = item.Icon;
              return (
                <article
                  key={item.title}
                  className="principle-card reveal"
                  style={{ animationDelay: `${220 + index * 120}ms` }}
                >
                  <div className="principle-icon-wrap">
                    <Icon size={22} strokeWidth={1.6} />
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.detail}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section id="modules" className="landing-slab landing-slab-ink">
          <div className="perspective-wrap reveal" style={{ animationDelay: '120ms' }}>
            <div className="perspective-dark-panel">
              <p className="eyebrow">Signature Module</p>
              <h2>The Perspective Module</h2>
              <p>
                A cross-plane workspace where dark urgency and light procedural clarity meet in a
                single decision surface.
              </p>
            </div>

            <article className="perspective-card">
              <p className="perspective-card-kicker">Operational Stack</p>
              <ul>
                {modules.map((module) => (
                  <li key={module.title}>
                    <h3>{module.title}</h3>
                    <p>{module.detail}</p>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        <section id="contact" className="landing-slab landing-slab-soft contact-slab">
          <div className="contact-grid">
            <div className="contact-copy reveal" style={{ animationDelay: '120ms' }}>
              <p className="eyebrow">Deployment Readiness</p>
              <h2>Bring your district team into one resilient command surface.</h2>
              <p>
                Start with a pilot region, validate alert handoff, then scale to full coastal
                operations with measurable confidence.
              </p>
            </div>

            <form
              className="contact-form reveal"
              style={{ animationDelay: '220ms' }}
              onSubmit={(event) => event.preventDefault()}
            >
              <label htmlFor="work-email">Work email</label>
              <input id="work-email" name="work-email" type="email" placeholder="name@agency.gov" />

              <label htmlFor="region">Primary region</label>
              <input id="region" name="region" type="text" placeholder="Cox's Bazar" />

              <button type="submit" className="btn-primary btn-block">
                Request Pilot Access
                <ArrowRight size={16} />
              </button>

              <p className="contact-note">
                <Users2 size={15} />
                Coordinated onboarding for admin and field teams.
              </p>
            </form>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <p>Nirapotta Platform</p>
        <p>Designed for coastal resilience operations</p>
        <p className="footer-alert">
          <ShieldAlert size={15} />
          Verified alert provenance and operator audit trail
        </p>
      </footer>
    </div>
  );
}
