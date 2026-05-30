/**
 * gen-brand-assets — regenerate the chainbard favicon kit + brand rasters.
 *
 * Two sources:
 *  - public/chainbard-mark.svg  — the bare mark, feeds the small/chrome outputs
 *    (favicon.ico 16/32/48, icon.png, apple-icon.png, icon-192/512.png).
 *    Rasterized at high density so the plume stays crisp at favicon sizes.
 *  - public/chainbard-logo.png  — gold woodcut bard's cap on a transparent
 *    ground (the SSOT). Feeds only the hero rasters (logo-512.png,
 *    logo-1024.png), which preserve that transparency.
 *
 * Every run deletes its prior outputs first, then regenerates from source.
 * Chrome/icon outputs are flattened onto solid #0b0a09 (the brand "ink"):
 * Apple/PWA icons composite onto black when transparent, so the ink ground is
 * required there. The hero logo rasters keep their alpha and float free.
 *
 * Run: bun run gen:brand
 */
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const ROOT = join(import.meta.dir, '..');
const MARK_SRC = join(ROOT, 'public/chainbard-mark.svg');
const LOGO_SRC = join(ROOT, 'public/chainbard-logo.png');
const INK = '#0b0a09';

const APP = join(ROOT, 'src/app');
const BRAND = join(ROOT, 'public/brand');

// Outputs this script owns and regenerates on every run.
const FAVICON = join(APP, 'favicon.ico');
const ICON = join(APP, 'icon.png');
const APPLE_ICON = join(APP, 'apple-icon.png');
const ICON_192 = join(BRAND, 'icon-192.png');
const ICON_512 = join(BRAND, 'icon-512.png');
const LOGO_512 = join(BRAND, 'logo-512.png');
const LOGO_1024 = join(BRAND, 'logo-1024.png');

const OUTPUTS = [FAVICON, ICON, APPLE_ICON, ICON_192, ICON_512, LOGO_512, LOGO_1024];

/** Square `size`, flattened onto solid ink, no alpha — chrome/icon pipeline. */
function raster(input: sharp.Sharp, size: number): sharp.Sharp {
  return input.resize(size, size, { fit: 'cover' }).flatten({ background: INK }).png();
}

/** Square `size`, alpha preserved — hero logo pipeline (transparent ground). */
function rasterTransparent(input: sharp.Sharp, size: number): sharp.Sharp {
  return input
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png();
}

/** Mark → small/chrome outputs. High density so the SVG plume stays crisp. */
function rasterMark(size: number): sharp.Sharp {
  return raster(sharp(MARK_SRC, { density: 384 }), size);
}

/** Logo → hero rasters. PNG source, no density needed; transparency preserved. */
function rasterLogo(size: number): sharp.Sharp {
  return rasterTransparent(sharp(LOGO_SRC), size);
}

async function writeRaster(path: string, source: sharp.Sharp): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await source.toFile(path);
}

async function main(): Promise<void> {
  // 1. Delete prior outputs so each run is reproducible.
  await Promise.all(OUTPUTS.map((p) => rm(p, { force: true })));

  // 2. App-router icons (Next 16 auto-wires these). From the mark.
  await writeRaster(ICON, rasterMark(512));
  await writeRaster(APPLE_ICON, rasterMark(180));

  // 3. PWA icons from the mark; hero logos from the logo.
  await writeRaster(ICON_192, rasterMark(192));
  await writeRaster(ICON_512, rasterMark(512));
  await writeRaster(LOGO_512, rasterLogo(512));
  await writeRaster(LOGO_1024, rasterLogo(1024));

  // 4. favicon.ico — multi-res 16/32/48 from the mark. sharp can't encode .ico,
  //    so render PNG buffers and let png-to-ico pack them.
  const icoSizes = [16, 32, 48];
  const icoPngs = await Promise.all(icoSizes.map((s) => rasterMark(s).toBuffer()));
  const ico = await pngToIco(icoPngs);
  await mkdir(dirname(FAVICON), { recursive: true });
  await Bun.write(FAVICON, ico);

  for (const p of OUTPUTS) {
    console.log('wrote', p.replace(`${ROOT}/`, ''));
  }
}

await main();
