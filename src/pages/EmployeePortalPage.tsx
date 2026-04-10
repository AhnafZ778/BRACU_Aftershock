import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEmployeeStore } from '../store/useEmployeeStore';
import { startSimulation } from '../simulation/employeeSimulator';

// Ensure simulation is running so employees are available
startSimulation();

const EMPLOYEES = [
  { id: 'EMP-001', name: 'Rahim Uddin',   area: 'Mirpur',      color: '#f43f5e' },
  { id: 'EMP-002', name: 'Salma Akter',   area: 'Gulshan',     color: '#8b5cf6' },
  { id: 'EMP-003', name: 'Kamal Hossain', area: 'Dhanmondi',   color: '#06b6d4' },
  { id: 'EMP-004', name: 'Fatema Begum',  area: 'Uttara',      color: '#22c55e' },
  { id: 'EMP-005', name: 'Jahangir Alam', area: 'Motijheel',   color: '#f59e0b' },
  { id: 'EMP-006', name: 'Nusrat Jahan',  area: 'Mohammadpur', color: '#ec4899' },
  { id: 'EMP-007', name: 'Tanvir Ahmed',  area: 'Badda',       color: '#3b82f6' },
  { id: 'EMP-008', name: 'Rubina Khatun', area: 'Tejgaon',     color: '#14b8a6' },
];

export function EmployeePortalPage() {
  const [selectedId, setSelectedId] = useState(EMPLOYEES[0].id);
  const [alertSent, setAlertSent] = useState(false);
  const { employees, addSosAlert } = useEmployeeStore();

  const selected = EMPLOYEES.find((e) => e.id === selectedId) || EMPLOYEES[0];

  const handleAlert = () => {
    // Get the employee's CURRENT GPS position from the simulation store
    const liveEmployee = employees.find((e) => e.id === selectedId);
    const lat = liveEmployee?.lat ?? selected.lat;
    const lng = liveEmployee?.lng ?? selected.lng;

    // Fire the SOS alert — this broadcasts to all tabs (dashboard)
    addSosAlert({
      employeeId: selected.id,
      employeeName: selected.name,
      area: selected.area,
      lat,
      lng,
      color: selected.color,
      timestamp: Date.now(),
    });

    setAlertSent(true);
    setTimeout(() => setAlertSent(false), 2500);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', 'Manrope', system-ui, sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Subtle radial glow behind the button */}
      <div style={{
        position: 'absolute',
        width: '500px',
        height: '500px',
        borderRadius: '50%',
        background: `radial-gradient(circle, ${selected.color}15 0%, transparent 70%)`,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        transition: 'background 400ms ease',
      }} />

      {/* Back link */}
      <Link to="/" style={{
        position: 'absolute',
        top: '1.5rem',
        left: '1.5rem',
        color: '#64748b',
        textDecoration: 'none',
        fontSize: '0.85rem',
        fontWeight: 500,
        transition: 'color 200ms',
      }}>
        ← Back
      </Link>

      {/* Title */}
      <h1 style={{
        color: '#f1f5f9',
        fontSize: 'clamp(1.2rem, 3vw, 1.6rem)',
        fontWeight: 600,
        letterSpacing: '-0.02em',
        marginBottom: '2rem',
        textAlign: 'center',
      }}>
        Employee Portal
      </h1>

      {/* Employee selector dropdown */}
      <div style={{
        position: 'relative',
        marginBottom: '3rem',
        width: 'min(320px, 90vw)',
      }}>
        <label style={{
          color: '#94a3b8',
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          fontWeight: 600,
          display: 'block',
          marginBottom: '0.5rem',
          textAlign: 'center',
        }}>
          Select Employee
        </label>
        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute',
            left: '14px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: selected.color,
            boxShadow: `0 0 8px ${selected.color}88`,
            transition: 'background 300ms, box-shadow 300ms',
            pointerEvents: 'none',
          }} />
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            style={{
              width: '100%',
              padding: '0.85rem 1rem 0.85rem 2.4rem',
              fontSize: '0.95rem',
              fontWeight: 500,
              fontFamily: "'Inter', system-ui, sans-serif",
              color: '#f1f5f9',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              outline: 'none',
              cursor: 'pointer',
              appearance: 'none',
              WebkitAppearance: 'none',
              backdropFilter: 'blur(12px)',
              transition: 'border-color 200ms',
            }}
            onFocus={(e) => e.target.style.borderColor = selected.color}
            onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
          >
            {EMPLOYEES.map((emp) => (
              <option key={emp.id} value={emp.id} style={{ background: '#1e1e2e', color: '#f1f5f9' }}>
                {emp.name} — {emp.area}
              </option>
            ))}
          </select>
          {/* Custom dropdown arrow */}
          <span style={{
            position: 'absolute',
            right: '14px',
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            color: '#64748b',
            fontSize: '0.7rem',
          }}>▼</span>
        </div>
      </div>

      {/* Big SOS / Alert button */}
      <button
        onClick={handleAlert}
        disabled={alertSent}
        style={{
          width: '160px',
          height: '160px',
          borderRadius: '50%',
          border: alertSent ? `4px solid #22c55e` : `4px solid ${selected.color}`,
          background: alertSent
            ? 'radial-gradient(circle at 40% 40%, #22c55e22 0%, #22c55e08 100%)'
            : `radial-gradient(circle at 40% 40%, ${selected.color}30 0%, ${selected.color}08 100%)`,
          cursor: alertSent ? 'default' : 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.4rem',
          transition: 'all 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          boxShadow: alertSent
            ? '0 0 60px #22c55e33, inset 0 0 30px #22c55e11'
            : `0 0 60px ${selected.color}22, inset 0 0 30px ${selected.color}11`,
          transform: alertSent ? 'scale(0.95)' : 'scale(1)',
          outline: 'none',
        }}
        onMouseEnter={(e) => {
          if (!alertSent) e.currentTarget.style.transform = 'scale(1.08)';
        }}
        onMouseLeave={(e) => {
          if (!alertSent) e.currentTarget.style.transform = 'scale(1)';
        }}
        onMouseDown={(e) => {
          if (!alertSent) e.currentTarget.style.transform = 'scale(0.95)';
        }}
        onMouseUp={(e) => {
          if (!alertSent) e.currentTarget.style.transform = 'scale(1.08)';
        }}
      >
        {alertSent ? (
          <>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span style={{ color: '#22c55e', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Sent
            </span>
          </>
        ) : (
          <>
            <AlertTriangle size={48} strokeWidth={2} color={selected.color} />
            <span style={{ color: selected.color, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              SOS Alert
            </span>
          </>
        )}
      </button>

      {/* Employee info below button */}
      <div style={{
        marginTop: '2rem',
        textAlign: 'center',
      }}>
        <p style={{
          color: '#94a3b8',
          fontSize: '0.82rem',
          margin: 0,
        }}>
          Logged in as
        </p>
        <p style={{
          color: '#f1f5f9',
          fontSize: '1.1rem',
          fontWeight: 600,
          margin: '0.3rem 0 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
        }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: selected.color,
            display: 'inline-block',
            boxShadow: `0 0 6px ${selected.color}`,
          }} />
          {selected.name}
        </p>
        <p style={{
          color: '#64748b',
          fontSize: '0.78rem',
          margin: '0.2rem 0 0',
        }}>
          {selected.id} · {selected.area}
        </p>
      </div>
    </div>
  );
}