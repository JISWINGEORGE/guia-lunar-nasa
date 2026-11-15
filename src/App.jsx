
import { useEffect, useState } from "react";
import "./App.css";
import { LolaTerrainPanel, LolaComparisonPanel } from "./LolaTerrainPanel";

const sites = [
  {
    id: 1,
    name: "Shackleton Rim",
    location: "89.7668° S · 171.8700° W",
    longitude: -171.87,
    latitude: -89.7668,
    description: "A candidate region near Shackleton crater. This representative reference point is used for comparing solar illumination and Earth visibility.",
  },
  {
    id: 2,
    name: "De Gerlache Rim 2",
    location: "88.2300° S · 64.6284° W",
    longitude: -64.6284,
    latitude: -88.23,
    description: "A candidate region near De Gerlache crater for comparing illumination and Earth visibility.",
  },
  {
    id: 3,
    name: "Malapert Massif",
    location: "85.9948° S · 0.23578° W",
    longitude: -0.23578,
    latitude: -85.9948,
    description: "An elevated lunar region that can be investigated for solar exposure and communication opportunities.",
  },
];

function toUTC(date, time) {
  const localDate = new Date(`${date}T${time}:00`);
  if (Number.isNaN(localDate.getTime())) throw new Error("Invalid observation date or time.");
  return localDate.toISOString().slice(0, 16).replace("T", " ");
}

function getStopTime(startTime) {
  const date = new Date(`${startTime.replace(" ", "T")}:00Z`);
  date.setUTCMinutes(date.getUTCMinutes() + 1);
  return date.toISOString().slice(0, 16).replace("T", " ");
}

let horizonsRequestQueue = Promise.resolve();

async function fetchHorizons(url) {
  const executeRequest = async () => {
    await new Promise((resolve) => setTimeout(resolve, 1200));

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await fetch(url);
        if (response.ok || ![429, 502, 503, 504].includes(response.status) || attempt === 3) return response;
      } catch (error) {
        if (attempt === 3) throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1200 * (2 ** attempt)));
    }
    throw new Error("Unable to reach JPL Horizons.");
  };

  const request = horizonsRequestQueue.then(executeRequest, executeRequest);
  horizonsRequestQueue = request.then(() => undefined, () => undefined);
  return request;
}

async function getHorizonsPosition(bodyId, date, time, site) {
  const startTime = toUTC(date, time);
  const stopTime = getStopTime(startTime);

  const params = new URLSearchParams({
    format: "json",
    COMMAND: `'${bodyId}'`,
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'OBSERVER'",
    OBJ_DATA: "'NO'",
    CENTER: "'coord@301'",
    COORD_TYPE: "'GEODETIC'",
    SITE_COORD: `'${site.longitude},${site.latitude},0'`,
    START_TIME: `'${startTime}'`,
    STOP_TIME: `'${stopTime}'`,
    STEP_SIZE: "'1m'",
    QUANTITIES: "'4'",
    CSV_FORMAT: "'YES'",
  });

  const response = await fetchHorizons(`/api/horizons?${params}`);
  if (!response.ok) throw new Error(`JPL server returned HTTP ${response.status}.`);

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  if (!data.result?.includes("$$SOE")) throw new Error("No observation table was returned by JPL.");

  const table = data.result.split("$$SOE")[1].split("$$EOE")[0];
  const firstLine = table.trim().split("\n").find(Boolean);
  if (!firstLine) throw new Error("No position data is available for this time.");

  const values = firstLine.split(",").map((value) => value.trim());
  const numbers = values.map((value) => Number.parseFloat(value)).filter(Number.isFinite);
  if (numbers.length < 2) throw new Error("Could not interpret the returned position data.");

  return {
    azimuth: numbers[numbers.length - 2],
    elevation: numbers[numbers.length - 1],
  };
}

async function getDailySeries(bodyId, date, site) {
  const startTime = toUTC(date, "00:00");
  const stopDate = new Date(`${startTime.replace(" ", "T")}:00Z`);
  stopDate.setTime(stopDate.getTime() + 24 * 60 * 60 * 1000);
  const stopTime = stopDate.toISOString().slice(0, 16).replace("T", " ");

  const params = new URLSearchParams({
    format: "json",
    COMMAND: `'${bodyId}'`,
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'OBSERVER'",
    OBJ_DATA: "'NO'",
    CENTER: "'coord@301'",
    COORD_TYPE: "'GEODETIC'",
    SITE_COORD: `'${site.longitude},${site.latitude},0'`,
    START_TIME: `'${startTime}'`,
    STOP_TIME: `'${stopTime}'`,
    STEP_SIZE: "'2h'",
    QUANTITIES: "'4'",
    CSV_FORMAT: "'YES'",
  });

  const response = await fetchHorizons(`/api/horizons?${params}`);
  if (!response.ok) throw new Error(`JPL server returned HTTP ${response.status}.`);

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  if (!data.result?.includes("$$SOE") || !data.result?.includes("$$EOE")) {
    throw new Error("JPL did not return a daily observation table.");
  }

  const table = data.result.split("$$SOE")[1].split("$$EOE")[0];
  const rows = table.trim().split(/\r?\n/).filter(Boolean);

  const points = rows.map((line, index) => {
    const columns = line.split(",").map((value) => value.trim());
    const numbers = columns.map((value) => Number.parseFloat(value)).filter(Number.isFinite);
    if (numbers.length < 2) return null;
    return {
      hour: index * 2,
      azimuth: numbers[numbers.length - 2],
      elevation: numbers[numbers.length - 1],
    };
  }).filter(Boolean);

  if (points.length < 10) throw new Error(`JPL returned ${points.length} daily samples; at least 10 were expected.`);
  return points;
}

function useJplData(loader, dependencies) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      setData(null);

      try {
        const result = await loader();
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err.message || "Unable to retrieve JPL data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  return { data, loading, error };
}

function StatusPill({ children, tone = "green" }) {
  return <span className={`status-pill ${tone}`}><i />{children}</span>;
}

function PanelTitle({ eyebrow, title, subtitle, tag }) {
  return (
    <div className="panel-title">
      <div>
        {eyebrow && <span className="micro-label">{eyebrow}</span>}
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {tag && <span className="panel-tag">{tag}</span>}
    </div>
  );
}

function MetricCard({ label, value, unit, detail, tone = "cyan", symbol }) {
  return (
    <div className={`metric-card metric-${tone}`}>
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-symbol">{symbol}</span>
      </div>
      <div className="metric-number">{value}<small>{unit}</small></div>
      <p>{detail}</p>
    </div>
  );
}

function MiniMoon() {
  return (
    <div className="moon-scene">
      <div className="moon-orbit orbit-one" />
      <div className="moon-orbit orbit-two" />
      <div className="moon-globe">
        <span className="crater crater-one" />
        <span className="crater crater-two" />
        <span className="crater crater-three" />
        <span className="crater crater-four" />
        <span className="crater crater-five" />
        <span className="moon-highlight" />
      </div>
      <span className="orbit-label label-north">LUNAR NORTH</span>
      <span className="orbit-label label-south">SOUTH POLE</span>
      <span className="orbit-label label-site">SELECTED REGION</span>
      <span className="orbit-point" />
    </div>
  );
}

function ConfigurationPanel({ selectedSite, setSelectedSite, date, setDate, time, setTime }) {
  return (
    <section className="panel config-panel">
      <PanelTitle eyebrow="MISSION PARAMETERS" title="Mission Configuration" subtitle="Set the reference region and observation window." tag="CONFIG / 01" />
      <div className="configuration-grid">
        <label>
          <span>LANDING REGION</span>
          <select value={selectedSite.id} onChange={(e) => setSelectedSite(sites.find((site) => site.id === Number(e.target.value)))}>
            {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select>
        </label>
        <label>
          <span>OBSERVATION DATE</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          <span>OBSERVATION TIME</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
    </section>
  );
}

function HorizonsPanel({ date, time, site }) {
  const { data: positions, loading, error } = useJplData(
    async () => {
      const [sun, earth] = await Promise.all([
        getHorizonsPosition("10", date, time, site),
        getHorizonsPosition("399", date, time, site),
      ]);
      return { sun, earth };
    },
    [date, time, site]
  );

  return (
    <section className="panel">
      <PanelTitle eyebrow="LIVE EPHEMERIS" title="JPL Horizons Observations" subtitle={`Observer-based Sun and Earth positions · ${site.name}`} tag="NASA / JPL" />
      {loading && <div className="api-message"><span className="loading-dot" />Contacting JPL Horizons observation service...</div>}
      {error && <div className="api-error"><strong>Observation request failed</strong><p>{error}</p></div>}
      {positions && (
        <>
          <div className="metrics-grid">
            <MetricCard label="SUN ELEVATION" value={positions.sun.elevation.toFixed(3)} unit="°" detail={positions.sun.elevation > 0 ? "Above geometric horizon" : "Below geometric horizon"} tone="amber" symbol="☼" />
            <MetricCard label="SUN AZIMUTH" value={positions.sun.azimuth.toFixed(3)} unit="°" detail="Apparent azimuth" tone="amber" symbol="↗" />
            <MetricCard label="EARTH ELEVATION" value={positions.earth.elevation.toFixed(3)} unit="°" detail={positions.earth.elevation > 0 ? "Above geometric horizon" : "Below geometric horizon"} tone="blue" symbol="◉" />
            <MetricCard label="EARTH AZIMUTH" value={positions.earth.azimuth.toFixed(3)} unit="°" detail="Apparent azimuth" tone="blue" symbol="↗" />
          </div>
          <SkyPositionPlot positions={positions} />
        </>
      )}
      <p className="api-disclaimer">Apparent observer-based positions returned by JPL Horizons. Positive elevation indicates position above the ideal geometric horizon only; local terrain may still obstruct the view.</p>
    </section>
  );
}

function SkyPositionPlot({ positions }) {
  const items = [
    { name: "SUN", value: positions.sun, color: "#ffc36b" },
    { name: "EARTH", value: positions.earth, color: "#57c9ff" },
  ];

  return (
    <div className="telemetry-plot">
      <div className="plot-heading"><span>LOCAL SKY POSITION</span><span>AZIMUTH / ELEVATION</span></div>
      <svg viewBox="0 0 720 230" role="img" aria-label="Sun and Earth azimuth and elevation plot">
        {[40, 85, 130, 175].map((y) => <line key={y} x1="48" x2="690" y1={y} y2={y} className="chart-gridline" />)}
        <line x1="48" x2="690" y1="130" y2="130" className="chart-axis" />
        <text x="8" y="44" className="chart-text">+90°</text>
        <text x="15" y="134" className="chart-text">0°</text>
        <text x="8" y="179" className="chart-text">−45°</text>
        <text x="48" y="215" className="chart-text">0° N</text>
        <text x="355" y="215" textAnchor="middle" className="chart-text">180°</text>
        <text x="690" y="215" textAnchor="end" className="chart-text">360° N</text>
        {items.map((item) => {
          const x = 48 + (item.value.azimuth / 360) * 642;
          const y = 130 - (item.value.elevation / 90) * 90;
          return (
            <g key={item.name}>
              <circle cx={x} cy={y} r="8" fill={item.color} stroke="#fff" strokeWidth="2" />
              <text x={x + 12} y={y - 10} fill={item.color} fontSize="13" fontWeight="600">{item.name}</text>
            </g>
          );
        })}
      </svg>
      <div className="chart-legend"><span><i className="sun-key" />SUN</span><span><i className="earth-key" />EARTH</span></div>
    </div>
  );
}

function DailySeriesPanel({ date, site, bodyId, title, subtitle, color, prefix = "" }) {
  const { data: points, loading, error } = useJplData(
    () => getDailySeries(bodyId, date, site),
    [bodyId, date, site]
  );

  const chartPoints = points?.map((point, index) => {
    const x = 48 + (index / Math.max(1, points.length - 1)) * 642;
    const y = 112 - (point.elevation / 90) * 88;
    return `${x},${y}`;
  }).join(" ");

  return (
    <section className="panel">
      <PanelTitle eyebrow="24-HOUR TELEMETRY" title={title} subtitle={`${subtitle} · ${site.name}`} tag="2 HOUR SAMPLES" />
      {loading && <div className="api-message"><span className="loading-dot" />Loading 24-hour observations from JPL...</div>}
      {error && <div className="api-error"><strong>Daily observations unavailable</strong><p>{error}</p></div>}
      {points && (
        <>
          <div className="telemetry-plot">
            <div className="plot-heading"><span>ELEVATION PROFILE</span><span>DEGREES / LOCAL TIME LABELS</span></div>
            <svg viewBox="0 0 720 230" role="img" aria-label={`${title} over 24 hours`}>
              {[24, 68, 112, 156, 200].map((y) => <line key={y} x1="48" x2="690" y1={y} y2={y} className="chart-gridline" />)}
              <line x1="48" x2="690" y1="112" y2="112" className="chart-axis" />
              <text x="8" y="28" className="chart-text">+90°</text>
              <text x="15" y="116" className="chart-text">0°</text>
              <text x="8" y="204" className="chart-text">−90°</text>
              <polyline points={chartPoints} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
              {points.map((point, index) => {
                const x = 48 + (index / Math.max(1, points.length - 1)) * 642;
                const y = 112 - (point.elevation / 90) * 88;
                return <g key={point.hour}><circle cx={x} cy={y} r="4" fill={color} stroke="#fff" strokeWidth="1" /><text x={x} y="222" className="chart-text" textAnchor="middle">{prefix}{String(point.hour).padStart(2, "0")}:00</text></g>;
              })}
            </svg>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>TIME OFFSET</th><th>AZIMUTH</th><th>ELEVATION</th><th>GEOMETRIC STATUS</th></tr></thead>
              <tbody>{points.map((point) => <tr key={point.hour}><td>{prefix}{String(point.hour).padStart(2, "0")}:00</td><td>{point.azimuth.toFixed(3)}°</td><td>{point.elevation.toFixed(3)}°</td><td><StatusPill tone={point.elevation > 0 ? "green" : "amber"}>{point.elevation > 0 ? "ABOVE HORIZON" : "BELOW HORIZON"}</StatusPill></td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}
      <p className="api-disclaimer">Actual apparent azimuth/elevation samples returned by JPL Horizons. Geometric elevation does not include crater-rim obstruction, local topography, antenna geometry or communication link constraints.</p>
    </section>
  );
}

function ComparisonPanel({ date, time }) {
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      setResults({});
      const entries = await Promise.all(sites.map(async (site) => {
        try {
          const [sun, earth] = await Promise.all([
            getHorizonsPosition("10", date, time, site),
            getHorizonsPosition("399", date, time, site),
          ]);
          return [site.id, { sun, earth, error: "" }];
        } catch (err) {
          return [site.id, { error: err.message }];
        }
      }));
      if (!cancelled) {
        setResults(Object.fromEntries(entries));
        setLoading(false);
      }
    }
    load().catch((err) => {
      if (!cancelled) { setError(err.message); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [date, time]);

  return (
    <section className="panel">
      <PanelTitle eyebrow="CROSS-SITE EPHEMERIS" title="Live Candidate-Site Comparison" subtitle="Sun and Earth apparent positions at the same observation instant." tag="JPL HORIZONS" />
      {loading && <div className="api-message"><span className="loading-dot" />Querying all candidate regions...</div>}
      {error && <div className="api-error">{error}</div>}
      <div className="table-scroll">
        <table>
          <thead><tr><th>CANDIDATE REGION</th><th>SUN AZIMUTH</th><th>SUN ELEVATION</th><th>EARTH AZIMUTH</th><th>EARTH ELEVATION</th></tr></thead>
          <tbody>{sites.map((site) => {
            const item = results[site.id];
            return <tr key={site.id}><td><strong>{site.name}</strong><small className="table-subtext">{site.location}</small></td>{item?.sun && item?.earth ? <><td>{item.sun.azimuth.toFixed(3)}°</td><td>{item.sun.elevation.toFixed(3)}°</td><td>{item.earth.azimuth.toFixed(3)}°</td><td>{item.earth.elevation.toFixed(3)}°</td></> : <td colSpan="4">{item?.error || (loading ? "Waiting for observation..." : "No observation returned")}</td>}</tr>;
          })}</tbody>
        </table>
      </div>
      <p className="api-disclaimer">Geometric ephemeris comparison only. These values do not constitute a landing-safety ranking.</p>
    </section>
  );
}

function Overview({ selectedSite, setSelectedSite, date, setDate, time, setTime }) {
  return (
    <>
      <section className="hero-banner">
        <div>
          <span className="micro-label">LUNAR SOUTH POLE EXPLORATION / MISSION 01</span>
          <h2>Find the right place to land.</h2>
          <p>Evaluate sunlight opportunity, Earth visibility and terrain measurements across potential lunar landing regions.</p>
          <div className="hero-meta"><StatusPill>RESEARCH MODE</StatusPill><span>3 CANDIDATE REGIONS</span><span>NASA DATA SOURCES</span></div>
        </div>
        <div className="hero-emblem"><span>GL</span><i>◌</i></div>
      </section>

      <ConfigurationPanel {...{ selectedSite, setSelectedSite, date, setDate, time, setTime }} />

      <div className="mission-grid">
        <div className="mission-column">
          <section className="panel status-panel">
            <PanelTitle eyebrow="SYSTEM STATUS" title="Mission systems" tag="NOMINAL" />
            <div className="status-stat"><span>ACTIVE CANDIDATE SITES</span><strong>03</strong><small>Reference regions loaded</small></div>
            <div className="status-stat"><span>DATA SOURCES</span><strong>02</strong><small>JPL Horizons + NASA LOLA</small></div>
            <div className="status-stat"><span>ANALYSIS MODE</span><strong className="status-word">LIVE</strong><small>Observer-based ephemeris</small></div>
          </section>
          <section className="panel selected-region-panel">
            <PanelTitle eyebrow="SELECTED REGION" title={selectedSite.name} tag={`SITE 0${selectedSite.id}`} />
            <div className="coordinate-block"><span>LATITUDE</span><strong>{selectedSite.latitude.toFixed(5)}°</strong></div>
            <div className="coordinate-block"><span>LONGITUDE</span><strong>{Math.abs(selectedSite.longitude).toFixed(5)}° W</strong></div>
            <p>{selectedSite.description}</p>
            <div className="site-switcher">{sites.map((site) => <button key={site.id} className={selectedSite.id === site.id ? "selected" : ""} onClick={() => setSelectedSite(site)}>0{site.id}</button>)}</div>
          </section>
        </div>

        <div className="mission-column">
          <section className="panel mission-readiness-panel">
            <PanelTitle eyebrow="SPACECRAFT STATUS" title="Lunar surface analysis" tag="RESEARCH" />
            <div className="readiness-display"><div className="readiness-ring"><span>LIVE</span><small>DATA</small></div><div><strong>Mission telemetry</strong><p>Selected region observation profile</p></div></div>
            <div className="readiness-row"><span>JPL EPHEMERIS</span><StatusPill>CONNECTED ON REQUEST</StatusPill></div>
            <div className="readiness-row"><span>LOLA TERRAIN</span><StatusPill tone="blue">PIXEL DATA</StatusPill></div>
            <div className="readiness-row"><span>LANDING SAFETY</span><StatusPill tone="amber">NOT ASSESSED</StatusPill></div>
            <div className="mission-note">No fabricated readiness score is generated. Mission indicators describe data availability and analysis scope only.</div>
          </section>
          <section className="panel date-summary">
            <span className="micro-label">OBSERVATION WINDOW</span>
            <strong>{date}</strong>
            <span>{time} · COMPUTER LOCAL TIME</span>
          </section>
        </div>

        <div className="mission-column">
          <section className="panel moon-panel">
            <PanelTitle eyebrow="LUNAR SOUTH POLE" title="Reference globe" tag="SCHEMATIC" />
            <MiniMoon />
            <div className="moon-caption"><span>◉ {selectedSite.name}</span><span>REGIONAL REFERENCE</span></div>
            <p className="api-disclaimer">Illustrative lunar visualization. Not a terrain map or precision landing-coordinate display.</p>
          </section>
          <section className="panel candidate-list">
            <PanelTitle eyebrow="MISSION TARGETS" title="Candidate regions" />
            {sites.map((site) => <button key={site.id} className={selectedSite.id === site.id ? "candidate-row active" : "candidate-row"} onClick={() => setSelectedSite(site)}><span className="candidate-index">0{site.id}</span><span><strong>{site.name}</strong><small>{site.location}</small></span><span className="candidate-arrow">↗</span></button>)}
          </section>
        </div>
      </div>

      <HorizonsPanel date={date} time={time} site={selectedSite} />
      <DailySeriesPanel date={date} site={selectedSite} bodyId="10" title="24-Hour Solar Elevation" subtitle="Sun elevation profile" color="#ffc36b" />
      <DailySeriesPanel date={date} site={selectedSite} bodyId="399" title="24-Hour Earth Geometric Visibility" subtitle="Earth elevation profile" color="#57c9ff" prefix="+" />
      <LolaTerrainPanel site={selectedSite} />

      <section className="disclaimer-panel">
        <span className="micro-label">DATA TRANSPARENCY</span>
        <p>JPL values are apparent ephemeris outputs for the displayed reference coordinates and observation time. LOLA values are individual raster-pixel measurements, not area-wide statistics. Terrain obstruction, illumination duration, communication link margin and landing safety are not established by this dashboard.</p>
      </section>
    </>
  );
}

function CompareSites({ date, time, setSelectedSite }) {
  return (
    <>
      <section className="page-intro"><span className="micro-label">CROSS-SITE ANALYSIS</span><h2>Compare candidate regions.</h2><p>Review ephemeris observations and sampled terrain measurements for all three reference locations.</p></section>
      <ComparisonPanel date={date} time={time} />
      <LolaComparisonPanel />
      <section className="panel">
        <PanelTitle eyebrow="REFERENCE DATA" title="Candidate Coordinates" subtitle="Representative points used for the observer queries." />
        <div className="candidate-table">
          {sites.map((site) => <button key={site.id} onClick={() => setSelectedSite(site)}><span>0{site.id}</span><strong>{site.name}</strong><small>{site.latitude.toFixed(5)}° · {site.longitude.toFixed(5)}°</small><b>SELECT REGION ↗</b></button>)}
        </div>
      </section>
    </>
  );
}

function Methodology() {
  const items = [
    ["01", "Sun position", "JPL Horizons provides apparent Sun azimuth and elevation from the selected lunar reference point and observation time. Positive elevation means above the ideal geometric horizon, not necessarily above nearby terrain."],
    ["02", "Earth position", "JPL Horizons provides apparent Earth azimuth and elevation. Positive elevation indicates geometric visibility above the ideal horizon. Terrain obstruction and link-budget constraints are separate analyses."],
    ["03", "Site comparison", "The comparison table queries Sun and Earth positions for every candidate at the same selected instant. It reports ephemeris outputs without generating arbitrary suitability scores."],
    ["04", "Terrain awareness", "NASA LOLA elevation and slope raster samples provide point measurements. They do not describe the entire landing region or establish landing safety."],
  ];

  return (
    <>
      <section className="page-intro"><span className="micro-label">SCIENCE / DATA / VALIDATION</span><h2>Methodology & data.</h2><p>A transparent approach to examining illumination, communication geometry and lunar surface characteristics.</p></section>
      <div className="method-grid">{items.map(([number, title, description]) => <section className="panel method-card" key={number}><span className="method-number">{number}</span><h3>{title}</h3><p>{description}</p></section>)}</div>
      <section className="panel source-panel">
        <PanelTitle eyebrow="REFERENCE LIBRARY" title="Data sources" subtitle="Scientific services and datasets used by Guía Lunar." />
        <a href="https://ssd.jpl.nasa.gov/horizons/" target="_blank" rel="noreferrer"><strong>NASA JPL Horizons</strong><span>Observer-based apparent ephemeris data ↗</span></a>
        <a href="https://pgda.gsfc.nasa.gov/products/90" target="_blank" rel="noreferrer"><strong>NASA Goddard LOLA Product 90</strong><span>South-pole elevation and slope raster products ↗</span></a>
        <a href="https://science.nasa.gov/moon/" target="_blank" rel="noreferrer"><strong>NASA Moon</strong><span>Background information and lunar science ↗</span></a>
        <a href="https://www.spaceappschallenge.org/" target="_blank" rel="noreferrer"><strong>NASA Space Apps Challenge</strong><span>Challenge information ↗</span></a>
      </section>
      <section className="disclaimer-panel"><span className="micro-label">IMPORTANT SCIENTIFIC LIMITATION</span><p>This dashboard reports geometric ephemeris observations and representative candidate-region measurements. It does not calculate terrain obstruction, surface illumination duration, communication link margin or certified landing safety. Results must not be interpreted as a certified landing-site assessment.</p></section>
    </>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("Overview");
  const [selectedSite, setSelectedSite] = useState(sites[0]);
  const [date, setDate] = useState("2026-11-14");
  const [time, setTime] = useState("08:00");

  const tabs = [
    { name: "Overview", icon: "◈" },
    { name: "Compare Sites", icon: "⌖" },
    { name: "Methodology", icon: "▤" },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">☾</div>
          <div><strong>GUÍA LUNAR</strong><small>LUNAR LANDING NAVIGATOR</small></div>
        </div>

        <div className="sidebar-section-label">MISSION CONTROL</div>
        <nav className="side-nav">
          {tabs.map((tab) => <button key={tab.name} className={activeTab === tab.name ? "active" : ""} onClick={() => setActiveTab(tab.name)}><span>{tab.icon}</span>{tab.name}</button>)}
        </nav>

        <div className="sidebar-bottom">
          <div className="signal-indicator"><i /> SYSTEM STATUS / RESEARCH MODE</div>
          <p>Exploring safer lunar landing possibilities through scientific data.</p>
          <div className="sidebar-version">NASA SPACE APPS CHALLENGE<br />2026 · GUÍA LUNAR</div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">MISSION <span>/</span> LUNAR SOUTH POLE <span>/</span> {activeTab.toUpperCase()}</div>
          <div className="topbar-right"><span className="environment-label"><i /> LUNAR ENVIRONMENT</span><div className="avatar">GL</div></div>
        </header>

        <div className="page-heading">
          <div><span className="micro-label">MISSION / LUNAR SOUTH POLE</span><h1>{activeTab === "Overview" ? "Mission Overview" : activeTab === "Compare Sites" ? "Landing Site Comparison" : "Methodology & Data"}</h1></div>
          <div className="mission-clock"><span>MISSION DATE</span><strong>{date}</strong></div>
        </div>

        <div className="page-content">
          {activeTab === "Overview" && <Overview {...{ selectedSite, setSelectedSite, date, setDate, time, setTime }} />}
          {activeTab === "Compare Sites" && <CompareSites {...{ date, time, setSelectedSite }} />}
          {activeTab === "Methodology" && <Methodology />}
        </div>

        <footer className="page-footer"><span>GUÍA LUNAR / LUNAR LANDING SITE NAVIGATOR</span><span>SPACE APPS CHALLENGE 2026</span></footer>
      </main>
    </div>
  );
}
