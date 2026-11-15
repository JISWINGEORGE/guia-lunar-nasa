
import { useEffect, useState } from "react";

function toHorizonsTime(date, time) {
  const localDate = new Date(`${date}T${time}:00`);

  if (Number.isNaN(localDate.getTime())) {
    throw new Error("Invalid date or time.");
  }

  return localDate.toISOString().slice(0, 16).replace("T", " ");
}

function addOneMinute(utcTime) {
  const date = new Date(`${utcTime.replace(" ", "T")}:00Z`);
  date.setUTCMinutes(date.getUTCMinutes() + 1);

  return date.toISOString().slice(0, 16).replace("T", " ");
}

async function getBodyPosition(bodyId, site, startTime, stopTime) {
  const params = new URLSearchParams();

  params.set("format", "json");
  params.set("COMMAND", `'${bodyId}'`);
  params.set("MAKE_EPHEM", "'YES'");
  params.set("EPHEM_TYPE", "'OBSERVER'");
  params.set("OBJ_DATA", "'NO'");
  params.set("CENTER", "'coord@301'");
  params.set("COORD_TYPE", "'GEODETIC'");
  params.set(
    "SITE_COORD",
    `'${site.longitude},${site.latitude},${site.altitude ?? 0}'`
  );
  params.set("START_TIME", `'${startTime}'`);
  params.set("STOP_TIME", `'${stopTime}'`);
  params.set("STEP_SIZE", "'1m'");
  params.set("QUANTITIES", "'4'");

  const response = await fetch(`/api/horizons?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`JPL request failed: HTTP ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  if (!data.result) {
    throw new Error("JPL returned no observation data.");
  }

  const start = data.result.indexOf("$$SOE");
  const end = data.result.indexOf("$$EOE");

  if (start === -1 || end === -1) {
    throw new Error("JPL did not return an observation table.");
  }

  const lines = data.result
    .slice(start + 5, end)
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);

  if (!lines.length) {
    throw new Error("No observations found.");
  }

  const values = lines[0].split(",").map((value) => value.trim());
  const numbers = values
    .map((value) => Number.parseFloat(value))
    .filter(Number.isFinite);

  if (numbers.length < 2) {
    throw new Error("Could not read azimuth and elevation.");
  }

  return {
    azimuth: numbers[numbers.length - 2],
    elevation: numbers[numbers.length - 1],
  };
}

export default function HorizonsPanel({ date, time, site }) {
  const [positions, setPositions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadPositions() {
      if (
        !site ||
        !Number.isFinite(Number(site.longitude)) ||
        !Number.isFinite(Number(site.latitude))
      ) {
        setError("Please select a valid landing site.");
        setPositions(null);
        return;
      }

      setLoading(true);
      setError("");
      setPositions(null);

      try {
        const startTime = toHorizonsTime(date, time);
        const stopTime = addOneMinute(startTime);

        const [sun, earth] = await Promise.all([
          getBodyPosition("10", site, startTime, stopTime),
          getBodyPosition("399", site, startTime, stopTime),
        ]);

        if (!cancelled) {
          setPositions({ sun, earth });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to retrieve JPL data.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadPositions();

    return () => {
      cancelled = true;
    };
  }, [date, time, site]);

  return (
    <section className="panel horizons-panel">
      <div className="panel-heading">
        <div>
          <h3>Live JPL Horizons observations</h3>
          <p>
            Apparent Sun and Earth positions at the selected lunar site
          </p>
        </div>
        <span className="panel-tag">NASA / JPL API</span>
      </div>

      {site && (
        <div className="reference-location">
          SELECTED SITE · {site.name} · {site.latitude}° LAT,
          {" "}{site.longitude}° LON
        </div>
      )}

      {loading && (
        <div className="api-message">
          <span className="loading-dot" />
          Requesting observations from JPL Horizons...
        </div>
      )}

      {error && (
        <div className="api-error">
          <strong>Unable to load observations</strong>
          <p>{error}</p>
        </div>
      )}

      {positions && (
        <>
          <div className="live-position-grid">
            <div className="live-position-card">
              <span className="live-icon sun-bg">☼</span>
              <div>
                <span className="live-label">SUN ELEVATION</span>
                <strong>{positions.sun.elevation.toFixed(2)}°</strong>
                <small>
                  Azimuth: {positions.sun.azimuth.toFixed(2)}°
                </small>
              </div>
              <span className="visibility-status">
                {positions.sun.elevation > 0
                  ? "Above horizon"
                  : "Below horizon"}
              </span>
            </div>

            <div className="live-position-card">
              <span className="live-icon earth-bg">◉</span>
              <div>
                <span className="live-label">EARTH ELEVATION</span>
                <strong>{positions.earth.elevation.toFixed(2)}°</strong>
                <small>
                  Azimuth: {positions.earth.azimuth.toFixed(2)}°
                </small>
              </div>
              <span className="visibility-status">
                {positions.earth.elevation > 0
                  ? "Above horizon"
                  : "Below horizon"}
              </span>
            </div>
          </div>

          <p className="api-disclaimer">
            JPL Horizons apparent observer coordinates. Local terrain
            obstruction is not included.
          </p>
        </>
      )}

      <div className="api-footer">
        <span>Source: JPL Solar System Dynamics</span>
        <a
          href="https://ssd.jpl.nasa.gov/horizons/"
          target="_blank"
          rel="noreferrer"
        >
          Horizons documentation ↗
        </a>
      </div>
    </section>
  );
}
// ------------------------------------------
// JPL HORIZONS DAILY EARTH SERIES
// ------------------------------------------

async function getHorizonsEarthDailySeries(date, site) {
  const startTime = toUTC(date, "00:00");

  const stopDate = new Date(
    `${startTime.replace(" ", "T")}:00Z`
  );

  stopDate.setTime(
    stopDate.getTime() + 24 * 60 * 60 * 1000
  );

  const stopTime = stopDate
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");

  const params = new URLSearchParams({
    format: "json",
    COMMAND: "'399'",
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

  const response = await fetchHorizons(
    `/api/horizons?${params}`
  );

  if (!response.ok) {
    throw new Error(
      `JPL server returned HTTP ${response.status}.`
    );
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  if (
    !data.result ||
    !data.result.includes("$$SOE") ||
    !data.result.includes("$$EOE")
  ) {
    throw new Error(
      "JPL did not return a daily Earth observation table."
    );
  }

  const table = data.result
    .split("$$SOE")[1]
    .split("$$EOE")[0];

  const rows = table
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);

  const points = rows
    .map((line, index) => {
      const columns = line
        .split(",")
        .map((value) => value.trim());

      const numbers = columns
        .map((value) => Number.parseFloat(value))
        .filter(Number.isFinite);

      if (numbers.length < 2) return null;

      return {
        hour: index * 2,
        azimuth: numbers[numbers.length - 2],
        elevation: numbers[numbers.length - 1],
      };
    })
    .filter(Boolean);

  if (points.length < 10) {
    throw new Error(
      `JPL returned only ${points.length} Earth samples.`
    );
  }

  return points;
}