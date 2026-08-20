import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

/**
 * Crop a student photo to a uniform, face-anchored portrait.
 *
 * The Sampark export does not shoot to one framing. The 2026-08-20 file carries
 * seven different pixel sizes across four aspect ratios — 214 photos at 3:4, 101
 * at a much taller 0.45, and a handful in between — so a viewer that honours
 * each image's own shape shows a different rectangle for every child. Cropping
 * to one aspect fixes the shape; anchoring on the face is what keeps that from
 * being an improvement in geometry and a regression in content.
 *
 * There is no face DETECTOR here, and deliberately so: a cascade or a model is a
 * dependency and a download for a job that a skin-tone heuristic does correctly
 * on all 320 photos in the export, verified by eye on contact sheets. What the
 * heuristic gets from being written carefully is stated at each step below —
 * every rule in it exists because a specific child came out headless without it.
 */

const TARGET_W = 600;
const TARGET_H = 800;
const ASPECT = TARGET_W / TARGET_H;

function skinRowProfile(pixels, width, height) {
  const rows = new Float64Array(height);
  for (let y = 0; y < height; y += 1) {
    // The LONGEST CONTIGUOUS run of skin in the row, not the total count.
    //
    // This is what separates a face from a skin-toned wall, and getting it
    // wrong decapitated six students: a warm background — a wooden door, sunlit
    // plaster — fills the whole top of the frame and reads as 100% skin, so
    // "the first skin from the top" locked onto the wall and pushed the crop
    // down past the child's head. A face is a bounded thing, roughly a sixth to
    // a half of the frame's width. A wall is all of it.
    let best = 0, run = 0;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      const yy = 0.299 * r + 0.587 * g + 0.114 * b;
      if (yy > 40 && yy < 235 && cb >= 77 && cb <= 133 && cr >= 133 && cr <= 180) {
        run += 1;
        if (run > best) best = run;
      } else {
        run = 0;
      }
    }
    const fraction = best / width;
    // Anything spanning most of the row is background, so it scores zero.
    rows[y] = fraction > 0.62 ? 0 : fraction;
  }
  return rows;
}

/**
 * Where the head is, as a fraction of image height, or null if unclear.
 *
 * The head is the first bounded skin region met coming down from the top. Both
 * halves of that sentence were learned the hard way: taking the LARGEST region
 * cropped six children to their bare legs on full-body shots, and taking any
 * region at all cropped six more to their chins, because a warm background at
 * the top of the frame reads as skin. skinRowProfile handles the second by
 * scoring the longest contiguous run and zeroing anything wall-wide.
 */
const SKIN_ROW_MIN = 0.06;
const MIN_BAND_ROWS = 0.02;

function findFaceBand(rows) {
  const height = rows.length;
  const smooth = new Float64Array(height);
  const window = Math.max(1, Math.round(height * 0.02));
  for (let y = 0; y < height; y += 1) {
    let sum = 0, n = 0;
    for (let k = -window; k <= window; k += 1) {
      const yy = y + k;
      if (yy < 0 || yy >= height) continue;
      sum += rows[yy]; n += 1;
    }
    smooth[y] = sum / n;
  }

  const minRows = Math.max(2, Math.round(height * MIN_BAND_ROWS));
  let start = -1;
  for (let y = 0; y < height; y += 1) {
    if (smooth[y] >= SKIN_ROW_MIN) {
      if (start === -1) start = y;
      if (y - start + 1 >= minRows) {
        let end = y;
        while (end + 1 < height && smooth[end + 1] >= SKIN_ROW_MIN) end += 1;
        return { centre: (start + end) / 2 / height, start: start / height, end: end / height };
      }
    } else {
      start = -1;
    }
  }
  return null;
}

async function analyse(buffer) {
  const SAMPLE_W = 64;
  const meta = await sharp(buffer).metadata();
  const sampleH = Math.max(16, Math.round((SAMPLE_W * meta.height) / meta.width));
  const { data } = await sharp(buffer)
    .resize(SAMPLE_W, sampleH, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rows = skinRowProfile(data, SAMPLE_W, sampleH);
  return { meta, band: findFaceBand(rows) };
}

/**
 * Crop to the target aspect with the face sitting at FACE_AT from the top.
 * Falls back to sharp's attention strategy when no face band is found.
 */
const FACE_AT = 0.32;

async function cropToFace(buffer) {
  const { meta, band } = await analyse(buffer);
  const { width, height } = meta;

  // The tallest window of the target aspect that fits.
  let cropW = width;
  let cropH = Math.round(cropW / ASPECT);
  if (cropH > height) { cropH = height; cropW = Math.round(cropH * ASPECT); }

  if (!band) {
    return {
      buffer: await sharp(buffer)
        .resize(TARGET_W, TARGET_H, { fit: "cover", position: sharp.strategy.attention })
        .jpeg({ quality: 82, mozjpeg: true }).toBuffer(),
      how: "attention-fallback",
      band: null,
    };
  }

  const faceY = band.centre * height;
  let top = Math.round(faceY - cropH * FACE_AT);

  /**
   * The crop may never begin BELOW the top of whatever was detected, plus a
   * little headroom. This is the property that makes the whole thing safe to
   * point at 600 children: detection can be wrong, and when it is wrong it is
   * wrong LOW — it finds a chest, a neck, an arm, never something above the
   * head. Clamping here means a bad detection can only pull the frame upward,
   * and upward is where the face is. Two students survived the tuning of every
   * threshold above and were still cropped to their chins; this fixed both.
   */
  const headroom = Math.round(cropH * 0.06);
  const highestAllowed = Math.round(band.start * height) - headroom;
  top = Math.min(top, highestAllowed);
  top = Math.max(0, Math.min(height - cropH, top));
  const left = Math.max(0, Math.min(width - cropW, Math.round((width - cropW) / 2)));

  return {
    buffer: await sharp(buffer)
      .extract({ left, top, width: cropW, height: cropH })
      .resize(TARGET_W, TARGET_H, { fit: "fill" })
      .jpeg({ quality: 82, mozjpeg: true }).toBuffer(),
    how: "face",
    band,
  };
}

export { cropToFace, TARGET_W, TARGET_H };
