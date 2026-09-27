// Turns an uploaded product photo into a square "Zenzo studio" shot that
// matches the storefront showcase photos: the product on a dark stage with a
// red glow on the left, a blue glow on the right and a glossy floor.
(function () {
  const size = 1200;
  const workingSize = 1600;
  const quality = 0.9;

  function context(canvas, options) {
    const ctx = canvas.getContext("2d", options);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    return ctx;
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("That file could not be read as an image."));
      };
      img.src = url;
    });
  }

  function drawStage(ctx, { floor = true } = {}) {
    ctx.fillStyle = "#040609";
    ctx.fillRect(0, 0, size, size);
    const red = ctx.createRadialGradient(0, size * 0.52, 0, 0, size * 0.52, size * 0.62);
    red.addColorStop(0, "rgba(255, 40, 40, 0.55)");
    red.addColorStop(0.35, "rgba(160, 20, 30, 0.22)");
    red.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = red;
    ctx.fillRect(0, 0, size, size);
    const blue = ctx.createRadialGradient(size, size * 0.5, 0, size, size * 0.5, size * 0.62);
    blue.addColorStop(0, "rgba(40, 130, 255, 0.6)");
    blue.addColorStop(0.35, "rgba(20, 70, 170, 0.24)");
    blue.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = blue;
    ctx.fillRect(0, 0, size, size);
    if (!floor) return;
    const floorTop = size * 0.68;
    const floorGradient = ctx.createLinearGradient(0, floorTop, 0, size);
    floorGradient.addColorStop(0, "rgba(22, 26, 34, 0.95)");
    floorGradient.addColorStop(1, "rgba(4, 6, 9, 1)");
    ctx.fillStyle = floorGradient;
    ctx.fillRect(0, floorTop, size, size - floorTop);
    const edge = ctx.createLinearGradient(0, 0, size, 0);
    edge.addColorStop(0, "rgba(255, 60, 60, 0.35)");
    edge.addColorStop(0.5, "rgba(255, 255, 255, 0.06)");
    edge.addColorStop(1, "rgba(60, 150, 255, 0.35)");
    ctx.fillStyle = edge;
    ctx.fillRect(0, floorTop, size, 2);
  }

  function vignette(ctx) {
    const shade = ctx.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size * 0.75);
    shade.addColorStop(0, "rgba(0, 0, 0, 0)");
    shade.addColorStop(1, "rgba(0, 0, 0, 0.55)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, size, size);
  }

  function distance(data, i, r, g, b) {
    const dr = data[i] - r;
    const dg = data[i + 1] - g;
    const db = data[i + 2] - b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  function neighbours(p, width, total) {
    const x = p % width;
    return [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]
      .filter((n) => n >= 0 && n < total);
  }

  // Grows the background from seed pixels: pixels close to the reference
  // colour, or blending smoothly from a neighbouring background pixel.
  function flood(state, seeds, [r, g, b], tolerance) {
    const { data, background, width } = state;
    const total = background.length;
    const queue = [];
    for (const p of seeds) {
      if (!background[p] && distance(data, p * 4, r, g, b) < tolerance) {
        background[p] = 1;
        queue.push(p);
      }
    }
    for (let k = 0; k < queue.length; k += 1) {
      const p = queue[k];
      for (const n of neighbours(p, width, total)) {
        if (background[n]) continue;
        const i = n * 4;
        const near = distance(data, i, r, g, b) < tolerance;
        const smooth = distance(data, i, data[p * 4], data[p * 4 + 1], data[p * 4 + 2]) < 9
          && distance(data, i, r, g, b) < tolerance * 1.8;
        if (near || smooth) {
          background[n] = 1;
          queue.push(n);
        }
      }
    }
    return queue.length;
  }

  // Prepares a working copy of the photo and removes a plain background by
  // flooding in from the edges. Returns null when the edges are too busy.
  function prepareCutOut(img) {
    const scale = Math.min(1, workingSize / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = context(canvas, { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, width, height);
    const data = ctx.getImageData(0, 0, width, height).data;
    const state = { width, height, data, background: new Uint8Array(width * height) };

    const border = [];
    for (let x = 0; x < width; x += 1) border.push(x, (height - 1) * width + x);
    for (let y = 0; y < height; y += 1) border.push(y * width, y * width + width - 1);
    const median = (offset) => border.map((p) => data[p * 4 + offset]).sort((a, b) => a - b)[Math.floor(border.length / 2)];
    const backdrop = [median(0), median(1), median(2)];
    const plain = border.filter((p) => distance(data, p * 4, ...backdrop) < 60).length / border.length;
    if (plain < 0.75) return null;

    let removed = flood(state, border, backdrop, 60);
    removed += removeEnclosedBackdrop(state, backdrop);
    if (removed < width * height * 0.08 || removed > width * height * 0.95) return null;
    cleanEdges(state, backdrop);
    return state;
  }

  // Backdrop showing through enclosed gaps (inside a loop track, between
  // parts) cannot be reached from the photo's edges. Remove sizeable patches
  // that are flat and almost exactly the backdrop colour; shaded product
  // surfaces such as white packaging vary too much to qualify.
  function removeEnclosedBackdrop(state, [r, g, b]) {
    const { data, background, width } = state;
    const total = background.length;
    const seen = new Uint8Array(total);
    const minPatch = total * 0.002;
    let removed = 0;
    for (let start = 0; start < total; start += 1) {
      if (background[start] || seen[start] || distance(data, start * 4, r, g, b) >= 24) continue;
      const patch = [start];
      seen[start] = 1;
      let sum = 0;
      let sumSquares = 0;
      for (let k = 0; k < patch.length; k += 1) {
        const p = patch[k];
        const light = data[p * 4] + data[p * 4 + 1] + data[p * 4 + 2];
        sum += light;
        sumSquares += light * light;
        for (const n of neighbours(p, width, total)) {
          if (seen[n] || background[n] || distance(data, n * 4, r, g, b) >= 24) continue;
          seen[n] = 1;
          patch.push(n);
        }
      }
      const mean = sum / patch.length;
      const spread = Math.sqrt(Math.max(0, sumSquares / patch.length - mean * mean)) / 3;
      if (patch.length >= minPatch && spread < 6) {
        for (const p of patch) background[p] = 1;
        removed += patch.length;
      }
    }
    return removed;
  }

  // Removes the light halo of old backdrop that clings to cut edges.
  function cleanEdges(state, [r, g, b]) {
    const { data, background, width, height } = state;
    for (let pass = 0; pass < 2; pass += 1) {
      const strip = [];
      for (let p = 0; p < background.length; p += 1) {
        if (background[p]) continue;
        const x = p % width;
        const y = Math.floor(p / width);
        const edge = (x > 0 && background[p - 1]) || (x < width - 1 && background[p + 1])
          || (y > 0 && background[p - width]) || (y < height - 1 && background[p + width]);
        if (edge && distance(data, p * 4, r, g, b) < 90) strip.push(p);
      }
      for (const p of strip) background[p] = 1;
    }
  }

  // Unsharp mask on the scaled product so fine detail stays crisp.
  function sharpen(canvas, amount) {
    const ctx = context(canvas, { willReadFrequently: true });
    const { width, height } = canvas;
    const pixels = ctx.getImageData(0, 0, width, height);
    const src = new Uint8ClampedArray(pixels.data);
    const out = pixels.data;
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const i = (y * width + x) * 4;
        if (src[i + 3] < 200) continue;
        for (let c = 0; c < 3; c += 1) {
          const around = src[i - 4 + c] + src[i + 4 + c] + src[i - width * 4 + c] + src[i + width * 4 + c];
          out[i + c] = src[i + c] * (1 + 4 * amount) - around * amount;
        }
      }
    }
    ctx.putImageData(pixels, 0, 0);
  }

  function productCanvas(state) {
    const { width, height, data, background } = state;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    const pixels = new ImageData(new Uint8ClampedArray(data), width, height);
    const out = pixels.data;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const p = y * width + x;
        if (background[p]) {
          out[p * 4 + 3] = 0;
          continue;
        }
        // Soften the cut edge so the product blends into the stage.
        const edge = (x > 0 && background[p - 1]) || (x < width - 1 && background[p + 1])
          || (y > 0 && background[p - width]) || (y < height - 1 && background[p + width]);
        if (edge) out[p * 4 + 3] = 170;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < minX) return null;
    const full = document.createElement("canvas");
    full.width = width;
    full.height = height;
    context(full).putImageData(pixels, 0, 0);
    const trimmed = document.createElement("canvas");
    trimmed.width = maxX - minX + 1;
    trimmed.height = maxY - minY + 1;
    context(trimmed).drawImage(full, minX, minY, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);
    return { canvas: trimmed, minX, minY };
  }

  // Draws the cut-out product on the stage and returns where it was placed,
  // so clicks on the preview can be mapped back to the photo.
  function composeCutOut(ctx, product) {
    drawStage(ctx);
    const image = product.canvas;
    const scale = Math.min((size * 0.74) / image.width, (size * 0.56) / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    const x = (size - width) / 2;
    const baseline = size * 0.74;
    const y = baseline - height;
    const scaled = document.createElement("canvas");
    scaled.width = Math.max(1, Math.round(width));
    scaled.height = Math.max(1, Math.round(height));
    const scaledCtx = context(scaled);
    scaledCtx.filter = "contrast(1.06) saturate(1.08)";
    scaledCtx.drawImage(image, 0, 0, scaled.width, scaled.height);
    sharpen(scaled, scale < 1 ? 0.35 : 0.55);

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.filter = "blur(14px)";
    ctx.beginPath();
    ctx.ellipse(size / 2, baseline + 4, width * 0.46, Math.max(10, height * 0.05), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Reflection on the glossy floor.
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.translate(0, baseline * 2);
    ctx.scale(1, -1);
    ctx.drawImage(scaled, x, y, width, height);
    ctx.restore();
    const fade = ctx.createLinearGradient(0, baseline, 0, baseline + height * 0.6);
    fade.addColorStop(0, "rgba(4, 6, 9, 0.2)");
    fade.addColorStop(1, "rgba(4, 6, 9, 1)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, baseline, size, size - baseline);

    ctx.drawImage(scaled, x, y, width, height);
    vignette(ctx);
    return { x, y, scale, minX: product.minX, minY: product.minY };
  }

  function composeFullPhoto(ctx, img) {
    const scale = Math.max(size / img.width, size / img.height);
    const width = img.width * scale;
    const height = img.height * scale;
    ctx.fillStyle = "#040609";
    ctx.fillRect(0, 0, size, size);
    ctx.filter = "brightness(0.82) contrast(1.08)";
    ctx.drawImage(img, (size - width) / 2, (size - height) / 2, width, height);
    ctx.filter = "none";
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    drawStage(ctx, { floor: false });
    ctx.restore();
    vignette(ctx);
  }

  function composeOriginal(ctx, img) {
    const scale = Math.max(size / img.width, size / img.height);
    ctx.fillStyle = "#040609";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, (size - img.width * scale) / 2, (size - img.height * scale) / 2, img.width * scale, img.height * scale);
  }

  function newCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    return canvas;
  }

  // Returns { dataUrl, mode, canEdit, removeAt(u, v), reset() }. removeAt takes a
  // point on the finished photo (0 to 1 across and down) and removes the
  // leftover background around it; dataUrl always holds the latest result.
  async function createStudioPhoto(file, { studio = true } = {}) {
    const img = await loadImage(file);
    const canvas = newCanvas();
    const ctx = context(canvas);
    const photo = { mode: "original", canEdit: false, dataUrl: "" };

    if (!studio) {
      composeOriginal(ctx, img);
      photo.dataUrl = canvas.toDataURL("image/jpeg", quality);
      return photo;
    }

    const initial = prepareCutOut(img);
    const product = initial && productCanvas(initial);
    if (!product) {
      composeFullPhoto(ctx, img);
      photo.mode = "studio-photo";
      photo.dataUrl = canvas.toDataURL("image/jpeg", quality);
      return photo;
    }

    const state = initial;
    const firstMask = state.background.slice();
    let placement = composeCutOut(ctx, product);
    photo.mode = "studio";
    photo.canEdit = true;
    photo.dataUrl = canvas.toDataURL("image/jpeg", quality);

    const render = () => {
      const current = productCanvas(state);
      if (!current) return false;
      const fresh = newCanvas();
      placement = composeCutOut(context(fresh), current);
      photo.dataUrl = fresh.toDataURL("image/jpeg", quality);
      return true;
    };

    photo.removeAt = (u, v) => {
      const px = Math.floor((u * size - placement.x) / placement.scale + placement.minX);
      const py = Math.floor((v * size - placement.y) / placement.scale + placement.minY);
      if (px < 0 || py < 0 || px >= state.width || py >= state.height) return false;
      const p = py * state.width + px;
      if (state.background[p]) return false;
      const i = p * 4;
      const before = state.background.slice();
      flood(state, [p], [state.data[i], state.data[i + 1], state.data[i + 2]], 40);
      if (!render()) {
        state.background = before;
        render();
        return false;
      }
      return true;
    };

    photo.reset = () => {
      state.background = firstMask.slice();
      render();
    };

    return photo;
  }

  window.zenzoStudio = { createStudioPhoto };
})();
