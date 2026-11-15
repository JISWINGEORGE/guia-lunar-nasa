
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "src", "App.jsx");
const componentPath = path.join(
  __dirname,
  "src",
  "LolaTerrainPanel.jsx"
);

if (!fs.existsSync(appPath)) {
  console.error("ERROR: src/App.jsx was not found.");
  process.exit(1);
}

let app = fs.readFileSync(appPath, "utf8");

const component = `import React from "react";

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
`;

fs.writeFileSync(componentPath, component, "utf8");
console.log("Created src/LolaTerrainPanel.jsx");

// Add the component import.
const importLine =
  'import { LolaTerrainPanel, LolaComparisonPanel } from "./LolaTerrainPanel";';

if (!app.includes(importLine)) {
  const cssImport = 'import "./App.css";';

  if (!app.includes(cssImport)) {
    console.error("ERROR: Could not find the App.css import.");
    process.exit(1);
  }

  app = app.replace(
    cssImport,
    cssImport + "\n" + importLine
  );
}

// Replace the old terrain status section.
const terrainMarker =
  "<h3>Terrain Analysis Status</h3>";

if (app.includes(terrainMarker)) {
  const markerIndex = app.indexOf(terrainMarker);
  const sectionStart = app.lastIndexOf(
    '<section className="panel">',
    markerIndex
  );
  const sectionEnd =
    app.indexOf("</section>", markerIndex) +
    "</section>".length;

  if (sectionStart === -1 || sectionEnd < "</section>".length) {
    console.error("ERROR: Could not safely locate the terrain section.");
    process.exit(1);
  }

  app =
    app.slice(0, sectionStart) +
    '<LolaTerrainPanel site={selectedSite} />' +
    app.slice(sectionEnd);

  console.log("Updated Overview terrain section.");
} else if (!app.includes("<LolaTerrainPanel site={selectedSite} />")) {
  console.error("ERROR: Existing terrain section was not found.");
  process.exit(1);
}

// Add the terrain comparison panel.
const comparisonAnchor =
  '<ComparisonPanel date={date} time={time} />';

if (
  app.includes(comparisonAnchor) &&
  !app.includes("<LolaComparisonPanel />")
) {
  app = app.replace(
    comparisonAnchor,
    comparisonAnchor + "\n\n            <LolaComparisonPanel />"
  );

  console.log("Added terrain comparison.");
}

// Update the methodology description.
app = app.replace(
  "NASA LOLA elevation and slope rasters must be sampled along the Sun and Earth lines of sight before terrain-corrected visibility can be reported. Those calculations are not yet implemented, so the dashboard marks terrain values as unavailable.",
  "NASA LOLA 20 m/pixel elevation and slope rasters are sampled at each representative reference coordinate. These local measurements describe the sampled pixel only; terrain-corrected Sun and Earth visibility is not yet calculated."
);

app = app.replace(
  "raster measurements are not yet integrated into this build.",
  "reference-pixel elevation and slope measurements are integrated into this build."
);

// Point the terrain data links to the dataset actually used.
app = app.replaceAll(
  "https://pgda.gsfc.nasa.gov/products/78",
  "https://pgda.gsfc.nasa.gov/products/90"
);

fs.writeFileSync(appPath, app, "utf8");

console.log("");
console.log("====================================");
console.log("GUÍA LUNAR LOLA INTEGRATION COMPLETE");
console.log("====================================");
console.log("Updated: src/App.jsx");
console.log("Created: src/LolaTerrainPanel.jsx");
console.log("Your existing JPL components were preserved.");
