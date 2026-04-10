import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BriefcaseBusiness,
  ShieldCheck,
} from 'lucide-react';
import './LandingPage.css';

type LoginSegment = {
  title: string;
  detail: string;
  Icon: typeof ShieldCheck;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  toneClass: string;
};

const loginSegments: LoginSegment[] = [
  {
    title: 'Admin',
    detail:
      'Command access for district operators managing the main dashboard and field team oversight.',
    Icon: ShieldCheck,
    primaryLabel: 'Open Dashboard',
    primaryHref: '/admin',
    toneClass: 'segment-card-admin',
  },
  {
    title: 'Employee',
    detail:
      'Task-focused workspace for field operations, area coverage tracking, and real-time progress reporting.',
    Icon: BriefcaseBusiness,
    primaryLabel: 'Open Employee Portal',
    primaryHref: '/employee',
    toneClass: 'segment-card-employee',
  },
];

export function LandingPage() {
  return (
    <div className="landing-page landing-page-centered">
      <div className="landing-grain" aria-hidden="true" />

      <header className="landing-nav">
        <div className="landing-logo">
          <span className="landing-logo-mark" aria-hidden="true" />
          <span className="landing-logo-text">Nirapotta</span>
        </div>
      </header>

      <main className="landing-main landing-main-centered">
        <section id="login" className="portal-section">
          <div className="portal-head reveal" style={{ animationDelay: '80ms' }}>
            <h2>Select your portal</h2>
          </div>

          <div className="login-segments-grid login-segments-two reveal" style={{ animationDelay: '180ms' }}>
            {loginSegments.map((segment) => {
              const Icon = segment.Icon;
              return (
                <article
                  key={segment.title}
                  className={`segment-card ${segment.toneClass}`}
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
      </main>

      <footer className="landing-footer">
        <p>Nirapotta Platform</p>
        <p>Designed for coastal resilience operations</p>
      </footer>
    </div>
  );
}
