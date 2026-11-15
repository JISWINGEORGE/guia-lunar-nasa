
import { fromUrl } from "geotiff";

const LUNAR_RADIUS = 1737400;

const SITES = [
  {
    name: "Shackleton Rim",
    latitude: -89.7668,
    longitude: -171.87,
  },
  {
    name: "De Gerlache Rim 2",
    latitude: -88.23,
    longitude: -64.6284,
  },
  {
    name: "Malapert Massif",
    latitude: -85.9948,
    longitude: -0.23578,
  },
];

const FILES = {
  elevation: "/api/lola/LDEM_80S_20MPP_ADJ.TIF",
  slope: "/api/lola/LDSM_80S_20MPP_ADJ.TIF",
};

// Convert lunar latitude/longitude into the
// south-polar stereographic projection used by NASA.
function projectCoordinates(latitude, longitude) {
  const lat = (latitude * Math.PI) / 180;
  const lon = (longitude * Math.PI) / 180;

  const rho =
    2 *
    LUNAR_RADIUS *
    Math.tan((Math.PI / 2 + lat) / 2);

  return {
    x: rho * Math.sin(lon),
    y: rho * Math.cos(lon),
  };
}

async function openRaster(url) {
  const tiff = await fromUrl(url, {
    allowFullFile: false,
  });

  return await tiff.getImage();
}

// Extract one pixel at a projected coordinate.
async function readPixel(image, x, y) {
  const [minX, minY, maxX, maxY] =
    image.getBoundingBox();

  const origin = image.getOrigin();
  const resolution = image.getResolution();

  if (
    x < minX ||
    x >= maxX ||
    y <= minY ||
    y > maxY
  ) {
    return {
      inside: false,
      value: null,
      reason: "Outside raster coverage",
    };
  }

  const column = Math.floor(
    (x - origin[0]) / resolution[0]
  );

  const row = Math.floor(
    (y - origin[1]) / resolution[1]
  );

  if (
    column < 0 ||
    row < 0 ||
    column >= image.getWidth() ||
    row >= image.getHeight()
  ) {
    return {
      inside: false,
      value: null,
      reason: "Pixel index outside raster",
    };
  }

  const raster = await image.readRasters({
    window: [
      column,
      row,
      column + 1,
      row + 1,
    ],
    samples: [0],
  });

  const value = Number(raster[0][0]);

  const directory = image.getFileDirectory();

  const noData =
    directory.GDAL_NODATA !== undefined
      ? Number(directory.GDAL_NODATA)
      : null;

  if (
    !Number.isFinite(value) ||
    (noData !== null && value === noData)
  ) {
    return {
      inside: true,
      value: null,
      reason: "No-data pixel",
      row,
      column,
    };
  }

  return {
    inside: true,
    value,
    row,
    column,
  };
}

export async function inspectLolaFiles() {
  console.log("Opening NASA LOLA datasets...");

  const [elevationImage, slopeImage] =
    await Promise.all([
      openRaster(FILES.elevation),
      openRaster(FILES.slope),
    ]);

  console.log("Both NASA rasters opened.");

  const results = [];

  for (const site of SITES) {
    console.log(`\nInspecting ${site.name}...`);

    const projected = projectCoordinates(
      site.latitude,
      site.longitude
    );

    const elevation = await readPixel(
      elevationImage,
      projected.x,
      projected.y
    );

    const slope = await readPixel(
      slopeImage,
      projected.x,
      projected.y
    );

    const result = {
      site: site.name,
      latitude: site.latitude,
      longitude: site.longitude,
      projectedX: projected.x,
      projectedY: projected.y,
      elevation,
      slope,
    };

    results.push(result);

    console.log(result);
  }

  console.log("\nFINAL NASA LOLA MEASUREMENTS");

  console.table(
    results.map((item) => ({
      site: item.site,
      elevation_m:
        item.elevation.value ?? item.elevation.reason,
      slope_degrees:
        item.slope.value ?? item.slope.reason,
      elevation_coverage: item.elevation.inside,
      slope_coverage: item.slope.inside,
    }))
  );

  console.log("Complete detailed results:", results);

  return results;
}
