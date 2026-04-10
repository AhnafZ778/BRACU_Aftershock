export function MethodPage() {
  return (
    <div className="h-full overflow-y-auto bg-ops-bg">
      <div className="max-w-3xl mx-auto pt-24 sm:pt-28 pb-12 px-6">
        <h1 className="text-3xl font-bold text-ops-text mb-2">Methodology</h1>
        <p className="text-ops-text-muted mb-10">
          How Nirapotta computes impact and prioritizes localities.
        </p>

        {/* Scoring Formula */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-ops-text mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-accent-primary/20 text-accent-primary flex items-center justify-center text-sm">1</span>
            Priority Scoring Formula
          </h2>
          <div className="bg-ops-surface rounded-xl p-6 border border-ops-border">
            <div className="space-y-3">
              {[
                { label: 'Hazard Severity', weight: '35%', color: 'bg-severity-critical' },
                { label: 'Exposed Population', weight: '25%', color: 'bg-severity-high' },
                { label: 'Critical Asset Exposure', weight: '20%', color: 'bg-severity-moderate' },
                { label: 'Shelter Access Gap', weight: '10%', color: 'bg-accent-teal' },
                { label: 'Vulnerability Proxy', weight: '10%', color: 'bg-accent-primary' },
              ].map(({ label, weight, color }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${color}`} />
                  <span className="text-sm text-ops-text flex-1">{label}</span>
                  <span className="text-sm font-mono text-ops-text-muted">{weight}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Data Layers */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-ops-text mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-accent-primary/20 text-accent-primary flex items-center justify-center text-sm">2</span>
            Data Layers
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              'Administrative Boundaries (HDX)',
              'Roads & Buildings (OpenStreetMap)',
              'Population Estimates (WorldPop)',
              'Elevation Data (Copernicus DEM)',
              'Cyclone Shelters',
              'Health Facilities',
              'Precomputed Hazard Polygons',
              'Scenario Configuration',
            ].map((layer) => (
              <div
                key={layer}
                className="bg-ops-surface rounded-lg p-3 border border-ops-border text-sm text-ops-text-muted"
              >
                {layer}
              </div>
            ))}
          </div>
        </section>

        {/* Simulation vs Precomputed */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-ops-text mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-accent-primary/20 text-accent-primary flex items-center justify-center text-sm">3</span>
            Simulated vs Precomputed
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-ops-surface rounded-xl p-5 border border-ops-border">
              <h3 className="text-sm font-semibold text-accent-teal mb-3">Precomputed</h3>
              <ul className="space-y-2 text-sm text-ops-text-muted">
                <li>• Hazard polygons</li>
                <li>• Track variants</li>
                <li>• Severity zones</li>
                <li>• Time-stage layers</li>
              </ul>
            </div>
            <div className="bg-ops-surface rounded-xl p-5 border border-ops-border">
              <h3 className="text-sm font-semibold text-severity-moderate mb-3">Calculated Live</h3>
              <ul className="space-y-2 text-sm text-ops-text-muted">
                <li>• Local exposure</li>
                <li>• Asset overlap</li>
                <li>• Shelter gap</li>
                <li>• Ranking & alert text</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Disclaimer */}
        <div className="bg-ops-surface/50 rounded-xl p-5 border border-ops-border text-sm text-ops-text-muted leading-relaxed">
          <strong className="text-ops-text">Note:</strong> Nirapotta is a decision-support
          prototype. It does not issue official alerts and does not replace
          authoritative warning systems. All scenario outputs are for planning
          and demonstration purposes.
        </div>
      </div>
    </div>
  );
}
