import React from "react";

const terrainData = {
  1: {
    name: "Shackleton Rim",
    elevation: 775.2217407226562,
    slope: 30.4020938873291,
  },
  2: {
    name: "De Gerlache Rim 2",
    elevation: -86.0228042602539,
    slope: 9.246885299682617,
  },
  3: {
    name: "Malapert Massif",
    elevation: 4783.236328125,
    slope: 3.810896158218384,
  },
};

export function LolaTerrainPanel({ site }) {
  const data = terrainData[site.id];

  if (!data) {
    return (
      <section className="panel">
        <h3>NASA LOLA Terrain Analysis</h3>
        <p>Terrain measurements unavailable for this site.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h3>NASA LOLA Terrain Analysis</h3>
          <p>
            Reference-pixel elevation and slope · {data.name}
          </p>
        </div>
        <span className="panel-tag">NASA LOLA</span>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-top">
            <span>SURFACE ELEVATION</span>
            <span className="metric-icon earth-icon">↗</span>
          </div>
          <strong>{data.elevation.toFixed(2)} m</strong>
          <small>Relative to lunar reference datum</small>
        </div>

        <div className="metric-card">
          <div className="metric-top">
            <span>LOCAL SLOPE</span>
            <span className="metric-icon sun-icon">⌁</span>
          </div>
          <strong>{data.slope.toFixed(2)}°</strong>
          <small>Sampled raster pixel</small>
        </div>
      </div>

      <div className="condition-note">
        <span>ⓘ</span>
        <p>
          These values represent one 20 m raster pixel at the
          selected reference coordinate. They do not describe
          the complete landing region or establish landing safety.
        </p>
      </div>

      <p className="api-disclaimer">
        Source: NASA Goddard LOLA south-pole elevation and slope
        products, 20 m/pixel. Elevation is in metres and slope
        is in degrees.
      </p>

      <div className="api-links">
        <a
          href="https://pgda.gsfc.nasa.gov/products/90"
          target="_blank"
          rel="noreferrer"
        >
          NASA LOLA dataset documentation ↗
        </a>
      </div>
    </section>
  );
}

export function LolaComparisonPanel() {
  const rows = Object.values(terrainData);

  return (
    <section className="panel table-panel">
      <div className="panel-heading">
        <div>
          <h3>NASA LOLA Terrain Comparison</h3>
          <p>
            Measured elevation and local slope at each
            candidate reference coordinate
          </p>
        </div>
        <span className="panel-tag">20 M / PIXEL</span>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>CANDIDATE REGION</th>
              <th>ELEVATION</th>
              <th>LOCAL SLOPE</th>
              <th>DATA STATUS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.name}>
                <td><strong>{item.name}</strong></td>
                <td>{item.elevation.toFixed(2)} m</td>
                <td>{item.slope.toFixed(2)}°</td>
                <td>Raster pixel sampled</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="api-disclaimer">
        These are point measurements, not area-wide statistics.
        No suitability score or safety ranking is calculated.
      </p>
    </section>
  );
}
