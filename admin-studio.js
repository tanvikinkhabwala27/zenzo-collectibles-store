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

  // Edge lights like the showcase photos: a narrow red light at the far left
  // and blue at the far right, falling off into the dark.
  function drawLights(ctx, strength = 1, centerY = 0.4) {
    for (const [x, color] of [[0, "255, 36, 44"], [size, "45, 125, 255"]]) {
      ctx.save();
      ctx.translate(x, size * centerY);
      ctx.scale(0.42, 1);
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.75);
      // Many stops give a smooth falloff instead of a visible band edge.
      for (const [stop, alpha] of [[0, 0.58], [0.12, 0.4], [0.28, 0.2], [0.48, 0.08], [0.72, 0.02], [1, 0]]) {
        glow.addColorStop(stop, `rgba(${color}, ${alpha * strength})`);
      }
      ctx.fillStyle = glow;
      ctx.fillRect(-size * 2, -size, size * 4, size * 2);
      ctx.restore();
    }
  }

  function drawStage(ctx, { floor = true } = {}) {
    ctx.fillStyle = "#05070b";
    ctx.fillRect(0, 0, size, size);
    drawLights(ctx);
    if (!floor) return;
    // Glossy table the display base stands on, catching the coloured lights.
    const tableTop = size * 0.8;
    const table = ctx.createLinearGradient(0, tableTop, 0, size);
    table.addColorStop(0, "#090b10");
    table.addColorStop(1, "#020304");
    ctx.fillStyle = table;
    ctx.fillRect(0, tableTop, size, size - tableTop);
    for (const [x, color] of [[0, "255, 40, 50"], [size, "50, 130, 255"]]) {
      const pool = ctx.createRadialGradient(x, tableTop + size * 0.08, 0, x, tableTop + size * 0.08, size * 0.3);
      pool.addColorStop(0, `rgba(${color}, 0.22)`);
      pool.addColorStop(1, `rgba(${color}, 0)`);
      ctx.fillStyle = pool;
      ctx.fillRect(0, tableTop, size, size - tableTop);
    }
  }

  // The black display base every product sits on, as in the showcase photos.
  function drawPedestal(ctx, centerX, topY, width) {
    const depth = size * 0.05;
    const front = size * 0.8 - topY;
    const left = centerX - width / 2;
    const right = centerX + width / 2;
    const inset = width * 0.035;
    ctx.save();
    // Top face, seen slightly from above.
    ctx.beginPath();
    ctx.moveTo(left + inset, topY - depth);
    ctx.lineTo(right - inset, topY - depth);
    ctx.lineTo(right, topY);
    ctx.lineTo(left, topY);
    ctx.closePath();
    const top = ctx.createLinearGradient(0, topY - depth, 0, topY);
    top.addColorStop(0, "#14171d");
    top.addColorStop(1, "#1c2027");
    ctx.fillStyle = top;
    ctx.fill();
    // Front face.
    const face = ctx.createLinearGradient(0, topY, 0, topY + front);
    face.addColorStop(0, "#0d0f13");
    face.addColorStop(1, "#08090c");
    ctx.fillStyle = face;
    ctx.fillRect(left, topY, width, front);
    // Edge highlight picking up the red and blue lights.
    const edge = ctx.createLinearGradient(left, 0, right, 0);
    edge.addColorStop(0, "rgba(255, 70, 70, 0.55)");
    edge.addColorStop(0.5, "rgba(255, 255, 255, 0.12)");
    edge.addColorStop(1, "rgba(70, 150, 255, 0.55)");
    ctx.fillStyle = edge;
    ctx.fillRect(left, topY - 1, width, 2);
    // Soft reflection of the base on the table.
    ctx.globalAlpha = 0.35;
    const mirror = ctx.createLinearGradient(0, topY + front, 0, topY + front * 1.8);
    mirror.addColorStop(0, "rgba(18, 21, 27, 0.9)");
    mirror.addColorStop(1, "rgba(5, 7, 11, 0)");
    ctx.fillStyle = mirror;
    ctx.fillRect(left, topY + front, width, front * 0.8);
    ctx.restore();
  }

  // Average brightness of the visible product pixels (0 to 255).
  function brightness(canvas) {
    const { data } = context(canvas, { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 16) {
      if (data[i + 3] < 200) continue;
      sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      count += 1;
    }
    return count ? sum / count : 128;
  }

  // Red light from the left and blue from the right catching the product's
  // edges, stronger for dark products so they stand out from the dark stage.
  function rimLight(ctx, product, x, y, strength) {
    const width = product.width;
    const height = product.height;
    const glow = document.createElement("canvas");
    glow.width = width;
    glow.height = height;
    const glowCtx = context(glow);
    for (const [offset, color] of [[-1, `rgba(255, 45, 55, ${0.32 * strength})`], [1, `rgba(55, 140, 255, ${0.3 * strength})`]]) {
      glowCtx.clearRect(0, 0, width, height);
      glowCtx.globalCompositeOperation = "source-over";
      glowCtx.drawImage(product, 0, 0);
      glowCtx.globalCompositeOperation = "source-in";
      glowCtx.fillStyle = color;
      glowCtx.fillRect(0, 0, width, height);
      ctx.save();
      ctx.filter = `blur(${Math.round(14 + 10 * strength)}px)`;
      ctx.drawImage(glow, x + offset * (6 + 8 * strength), y - 4, width, height);
      ctx.restore();
    }
  }

  function lightProduct(product, strength) {
    const lit = document.createElement("canvas");
    lit.width = product.width;
    lit.height = product.height;
    const litCtx = context(lit);
    litCtx.drawImage(product, 0, 0);
    litCtx.globalCompositeOperation = "screen";
    const sides = litCtx.createLinearGradient(0, 0, lit.width, 0);
    sides.addColorStop(0, `rgba(255, 50, 60, ${0.38 * strength})`);
    sides.addColorStop(0.22, "rgba(0, 0, 0, 0)");
    sides.addColorStop(0.78, "rgba(0, 0, 0, 0)");
    sides.addColorStop(1, `rgba(60, 140, 255, ${0.34 * strength})`);
    litCtx.fillStyle = sides;
    litCtx.fillRect(0, 0, lit.width, lit.height);
    // Keep the light on the product only.
    litCtx.globalCompositeOperation = "destination-in";
    litCtx.drawImage(product, 0, 0);
    return lit;
  }

  // Red accent: a red glow behind the product, so black and dark parts show
  // as a clear outline instead of disappearing into the dark background.
  function backGlow(ctx, x, y, width, height) {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const radius = Math.max(width, height) * 0.72 + size * 0.06;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, Math.min(1.2, Math.max(0.75, height / Math.max(width, 1))));
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    for (const [stop, alpha] of [[0, 0.62], [0.35, 0.42], [0.62, 0.18], [0.85, 0.05], [1, 0]]) {
      glow.addColorStop(stop, `rgba(205, 32, 44, ${alpha})`);
    }
    ctx.fillStyle = glow;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    ctx.restore();
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
    removeShadows(state, backdrop);
    cleanEdges(state, backdrop);
    keepMainProduct(state);
    return state;
  }

  // Shadows on a coloured backdrop (paper, a wall) are a darker shade of the
  // same colour; grow the background into them from the parts already
  // removed. Neutral grey or white backdrops are skipped, since shadows
  // there look like grey or black product parts.
  function removeShadows(state, [r, g, b]) {
    const { data, background, width } = state;
    const total = background.length;
    const sum = r + g + b;
    if (sum < 90) return;
    const tone = [r / sum, g / sum, b / sum];
    if (Math.max(...tone.map((t) => Math.abs(t - 1 / 3))) < 0.02) return;
    const isShadow = (p) => {
      const i = p * 4;
      const pixelSum = data[i] + data[i + 1] + data[i + 2];
      const level = pixelSum / sum;
      if (level < 0.35 || level > 1.05 || pixelSum < 30) return false;
      return Math.abs(data[i] / pixelSum - tone[0]) < 0.018
        && Math.abs(data[i + 1] / pixelSum - tone[1]) < 0.018
        && Math.abs(data[i + 2] / pixelSum - tone[2]) < 0.018;
    };
    const queue = [];
    for (let p = 0; p < total; p += 1) if (background[p]) queue.push(p);
    for (let k = 0; k < queue.length; k += 1) {
      for (const n of neighbours(queue[k], width, total)) {
        if (!background[n] && isShadow(n)) {
          background[n] = 1;
          queue.push(n);
        }
      }
    }
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
        // Anti-alias the cut edge: alpha follows how much of the 3x3
        // neighbourhood is product, so edges stay smooth when enlarged.
        let kept = 0;
        let counted = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            counted += 1;
            if (!background[ny * width + nx]) kept += 1;
          }
        }
        if (kept < counted) out[p * 4 + 3] = Math.round((out[p * 4 + 3] * (kept + 1)) / (counted + 1));
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
  // Accessory look, as in the accessory photos: a near-black seamless
  // background with faint red and blue at the sides, the product floating in
  // the middle with a soft shadow and no stand.
  function composeFloating(ctx, product, { accent = false } = {}) {
    ctx.fillStyle = "#0a0b0f";
    ctx.fillRect(0, 0, size, size);
    drawLights(ctx, 0.38, 0.62);
    const image = product.canvas;
    const scale = Math.min((size * 0.7) / image.width, (size * 0.68) / image.height, 2);
    const width = image.width * scale;
    const height = image.height * scale;
    const x = (size - width) / 2;
    const y = (size - height) / 2 + size * 0.02;
    const scaled = document.createElement("canvas");
    scaled.width = Math.max(1, Math.round(width));
    scaled.height = Math.max(1, Math.round(height));
    const scaledCtx = context(scaled);
    scaledCtx.filter = "contrast(1.05) saturate(1.06)";
    scaledCtx.drawImage(image, 0, 0, scaled.width, scaled.height);
    sharpen(scaled, scale < 1 ? 0.35 : 0.55);
    const darkness = (150 - brightness(scaled)) / 90;
    const strength = Math.min(1, Math.max(0.35, darkness));
    if (accent) backGlow(ctx, x, y, width, height);

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.filter = "blur(18px)";
    ctx.beginPath();
    ctx.ellipse(size / 2, y + height + size * 0.015, width * 0.4, Math.max(8, size * 0.018), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (accent) {
      rimLight(ctx, scaled, x, y, strength);
      ctx.drawImage(lightProduct(scaled, strength), x, y, width, height);
    } else {
      ctx.drawImage(scaled, x, y, width, height);
    }
    vignette(ctx);
    return { x, y, scale, minX: product.minX, minY: product.minY, dark: darkness > 0.35 };
  }

  // accent: false draws the standard look; true adds the red and blue edge
  // light, stronger for darker products. stand: false uses the accessory
  // look without the display base.
  function composeCutOut(ctx, product, { accent = false, stand = true } = {}) {
    if (!stand) return composeFloating(ctx, product, { accent });
    drawStage(ctx);
    const image = product.canvas;
    // Enlarging a small photo more than this only adds blur, so small
    // products are shown a little smaller instead.
    const maxEnlarge = 2;
    const scale = Math.min((size * 0.72) / image.width, (size * 0.5) / image.height, maxEnlarge);
    const width = image.width * scale;
    const height = image.height * scale;
    const x = (size - width) / 2;
    const baseline = size * 0.7;
    const y = baseline - height;
    const scaled = document.createElement("canvas");
    scaled.width = Math.max(1, Math.round(width));
    scaled.height = Math.max(1, Math.round(height));
    const scaledCtx = context(scaled);
    scaledCtx.filter = "contrast(1.06) saturate(1.08)";
    scaledCtx.drawImage(image, 0, 0, scaled.width, scaled.height);
    sharpen(scaled, scale < 1 ? 0.35 : 0.55);

    const darkness = (150 - brightness(scaled)) / 90;
    // Darker products get more coloured edge light.
    const strength = Math.min(1, Math.max(0.35, darkness));
    if (accent) backGlow(ctx, x, y, width, height);
    // Same wide base for every product, like the showcase photos.
    drawPedestal(ctx, size / 2, baseline + size * 0.012, Math.max(width * 1.12, size * 0.86));

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.filter = "blur(10px)";
    ctx.beginPath();
    ctx.ellipse(size / 2, baseline - 2, width * 0.44, Math.max(6, size * 0.012), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (accent) {
      rimLight(ctx, scaled, x, y, strength);
      ctx.drawImage(lightProduct(scaled, strength), x, y, width, height);
    } else {
      ctx.drawImage(scaled, x, y, width, height);
    }
    vignette(ctx);
    return { x, y, scale, minX: product.minX, minY: product.minY, dark: darkness > 0.35 };
  }

  // accent: true lights a busy photo more strongly in red and blue.
  function composeFullPhoto(ctx, img, { accent = false } = {}) {
    const scale = Math.max(size / img.width, size / img.height);
    const width = img.width * scale;
    const height = img.height * scale;
    ctx.fillStyle = "#040609";
    ctx.fillRect(0, 0, size, size);
    ctx.filter = "brightness(0.82) contrast(1.08)";
    ctx.drawImage(img, (size - width) / 2, (size - height) / 2, width, height);
    ctx.filter = "none";
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    drawLights(ctx, accent ? 1.5 : 0.8);
    ctx.restore();
    if (accent) {
      // Tint the sides red and blue so the accent shows even on bright photos.
      ctx.save();
      ctx.globalCompositeOperation = "overlay";
      const tint = ctx.createLinearGradient(0, 0, size, 0);
      tint.addColorStop(0, "rgba(255, 30, 40, 0.75)");
      tint.addColorStop(0.4, "rgba(255, 30, 40, 0)");
      tint.addColorStop(0.6, "rgba(40, 120, 255, 0)");
      tint.addColorStop(1, "rgba(40, 120, 255, 0.7)");
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, size, size);
      ctx.restore();
    }
    vignette(ctx);
  }

  // Photos that already have a dark studio background (the showcase photos,
  // or ones made with this tool) are kept as they are; the accent only adds
  // red and blue light on top.
  function addAccentLighting(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    drawLights(ctx, 1.1);
    ctx.globalCompositeOperation = "overlay";
    const tint = ctx.createLinearGradient(0, 0, size, 0);
    tint.addColorStop(0, "rgba(255, 30, 40, 0.55)");
    tint.addColorStop(0.35, "rgba(255, 30, 40, 0)");
    tint.addColorStop(0.65, "rgba(40, 120, 255, 0)");
    tint.addColorStop(1, "rgba(40, 120, 255, 0.5)");
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();
  }

  function composeRestyle(ctx, img, { accent = false } = {}) {
    composeOriginal(ctx, img);
    if (accent) addAccentLighting(ctx);
  }

  // Photos made by the stand version of this tool: the product stands with
  // its base line at 70% of the height on a stage this file can redraw
  // exactly. Redrawing the empty stage (plain, or with accent lighting added
  // later) and comparing it with the photo separates the product, so it can
  // be moved onto the floating accessory look. Returns a product canvas, or
  // null when the photo was not made that way.
  function extractFromStandPhoto(img) {
    const photo = newCanvas();
    const photoCtx = context(photo, { willReadFrequently: true });
    composeOriginal(photoCtx, img);
    const pixels = photoCtx.getImageData(0, 0, size, size).data;

    const plain = newCanvas();
    const plainCtx = context(plain, { willReadFrequently: true });
    drawStage(plainCtx);
    drawPedestal(plainCtx, size / 2, size * 0.712, size * 0.86);
    vignette(plainCtx);
    const lit = newCanvas();
    const litCtx = context(lit, { willReadFrequently: true });
    litCtx.drawImage(plain, 0, 0);
    addAccentLighting(litCtx);

    // Pick the empty stage that matches the photo best. Both the top band
    // (backdrop) and the front of the stand must match, so photos that only
    // happen to have a dark background are left alone.
    const regionScore = (data, top, bottom, left, right) => {
      let total = 0;
      let count = 0;
      for (let y = Math.round(size * top); y < size * bottom; y += 3) {
        for (let x = Math.round(size * left); x < size * right; x += 3) {
          const i = (y * size + x) * 4;
          total += Math.abs(data[i] - pixels[i]) + Math.abs(data[i + 1] - pixels[i + 1]) + Math.abs(data[i + 2] - pixels[i + 2]);
          count += 1;
        }
      }
      return total / count / 3;
    };
    let best = null;
    for (const candidate of [plainCtx, litCtx]) {
      const data = candidate.getImageData(0, 0, size, size).data;
      const score = regionScore(data, 0, 0.15, 0, 1);
      if (!best || score < best.score) best = { score, data };
    }
    if (!best || best.score > 12 || regionScore(best.data, 0.735, 0.79, 0.1, 0.9) > 8) return null;

    const cutY = Math.round(size * 0.7);
    const state = { width: size, height: size, data: pixels, background: new Uint8Array(size * size) };
    const candidateBackground = new Uint8Array(size * size);
    for (let p = 0; p < size * size; p += 1) {
      const i = p * 4;
      const diff = Math.abs(best.data[i] - pixels[i]) + Math.abs(best.data[i + 1] - pixels[i + 1]) + Math.abs(best.data[i + 2] - pixels[i + 2]);
      candidateBackground[p] = Math.floor(p / size) >= cutY || diff < 36 ? 1 : 0;
    }
    // Background is what matches the empty stage and connects to the edges;
    // anything enclosed by the product (dark parts close to the stage
    // colour) stays with the product.
    const queue = [];
    for (let x = 0; x < size; x += 1) queue.push(x, (size - 1) * size + x);
    for (let y = 0; y < size; y += 1) queue.push(y * size, y * size + size - 1);
    for (const p of queue) if (candidateBackground[p]) state.background[p] = 1;
    for (let k = 0; k < queue.length; k += 1) {
      const p = queue[k];
      if (!state.background[p]) continue;
      for (const n of neighbours(p, size, size * size)) {
        if (!state.background[n] && candidateBackground[n]) {
          state.background[n] = 1;
          queue.push(n);
        }
      }
    }
    keepMainProduct(state);
    if (looksLikeLeftoverLight(state)) return null;
    const product = productCanvas(state);
    if (!product || product.canvas.width < size * 0.03 || product.canvas.height < size * 0.03) return null;
    return product;
  }

  // When much of what is left is dark, strongly red or blue light from the
  // stage rather than the product, the separation went wrong; the photo is
  // then kept as it is instead of saving a broken edit.
  function looksLikeLeftoverLight(state) {
    const { data, background } = state;
    let kept = 0;
    let light = 0;
    for (let p = 0; p < background.length; p += 2) {
      if (background[p]) continue;
      const i = p * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      kept += 1;
      const dark = r * 0.299 + g * 0.587 + b * 0.114 < 110;
      if (dark && ((b > r + 35 && b > g + 15) || (r > g + 45 && r > b + 35))) light += 1;
    }
    return !kept || light / kept > 0.2;
  }

  // Drops stray specks and leftover patches that are not part of the
  // product: keeps the largest piece and anything close to it (a key ring
  // or chain), removes the rest.
  function keepMainProduct(state) {
    const { width, height, background } = state;
    const label = new Int32Array(width * height);
    const pieces = [];
    for (let start = 0; start < width * height; start += 1) {
      if (background[start] || label[start]) continue;
      const id = pieces.length + 1;
      const piece = { id, area: 0, minX: width, minY: height, maxX: 0, maxY: 0 };
      const stack = [start];
      label[start] = id;
      while (stack.length) {
        const p = stack.pop();
        const x = p % width;
        const y = (p - x) / width;
        piece.area += 1;
        if (x < piece.minX) piece.minX = x;
        if (x > piece.maxX) piece.maxX = x;
        if (y < piece.minY) piece.minY = y;
        if (y > piece.maxY) piece.maxY = y;
        for (const n of neighbours(p, width, width * height)) {
          if (!background[n] && !label[n]) {
            label[n] = id;
            stack.push(n);
          }
        }
      }
      pieces.push(piece);
    }
    if (pieces.length < 2) return;
    const main = pieces.reduce((a, b) => (b.area > a.area ? b : a));
    const margin = width * 0.04;
    const keep = new Uint8Array(pieces.length + 1);
    for (const piece of pieces) {
      const near = piece.maxX >= main.minX - margin && piece.minX <= main.maxX + margin
        && piece.maxY >= main.minY - margin && piece.minY <= main.maxY + margin;
      keep[piece.id] = piece === main || (near && piece.area >= 30) ? 1 : 0;
    }
    for (let p = 0; p < width * height; p += 1) {
      if (label[p] && !keep[label[p]]) background[p] = 1;
    }
  }

  function hasDarkBackdrop(img) {
    const sample = document.createElement("canvas");
    sample.width = 64;
    sample.height = 64;
    const sampleCtx = context(sample, { willReadFrequently: true });
    sampleCtx.drawImage(img, 0, 0, 64, 64);
    const { data } = sampleCtx.getImageData(0, 0, 64, 64);
    // The top edge is dark in every studio-look photo (the side lights and
    // the table make the other edges brighter), and bright in wall photos.
    const edge = [];
    for (let i = 8; i < 56; i += 1) edge.push(i, 64 + i);
    const light = edge.map((p) => data[p * 4] * 0.299 + data[p * 4 + 1] * 0.587 + data[p * 4 + 2] * 0.114)
      .sort((a, b) => a - b);
    return light[Math.floor(light.length / 2)] < 45;
  }

  function averageBrightness(img) {
    const sample = document.createElement("canvas");
    sample.width = 64;
    sample.height = 64;
    context(sample).drawImage(img, 0, 0, 64, 64);
    return brightness(sample);
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
  // Cut-out photos also get variants { standard, accent } and a choice, which
  // starts on accent for dark products; dataUrl follows the choice.
  async function createStudioPhoto(file, { studio = true, stand = true } = {}) {
    const img = await loadImage(file);
    const canvas = newCanvas();
    const ctx = context(canvas);
    const photo = {
      mode: "original",
      canEdit: false,
      dataUrl: "",
      sourceWidth: img.naturalWidth || img.width,
      sourceHeight: img.naturalHeight || img.height
    };

    if (!studio) {
      composeOriginal(ctx, img);
      photo.dataUrl = canvas.toDataURL("image/jpeg", quality);
      return photo;
    }

    // Non-car photos that were made with the stand: move the product onto the
    // floating accessory look.
    const standless = !stand && hasDarkBackdrop(img) ? extractFromStandPhoto(img) : null;
    if (standless) {
      photo.mode = "unstand";
      photo.variants = {};
      let placement;
      for (const variant of ["standard", "accent"]) {
        const fresh = newCanvas();
        placement = composeFloating(context(fresh), standless, { accent: variant === "accent" });
        photo.variants[variant] = fresh.toDataURL("image/jpeg", quality);
      }
      photo.choice = placement.dark ? "accent" : "standard";
      delete photo.dataUrl;
      Object.defineProperty(photo, "dataUrl", {
        get: () => photo.variants[photo.choice],
        enumerable: true
      });
      return photo;
    }

    if (hasDarkBackdrop(img)) {
      photo.mode = "restyle";
      photo.variants = {};
      for (const variant of ["standard", "accent"]) {
        const fresh = newCanvas();
        composeRestyle(context(fresh), img, { accent: variant === "accent" });
        photo.variants[variant] = fresh.toDataURL("image/jpeg", quality);
      }
      photo.choice = "accent";
      delete photo.dataUrl;
      Object.defineProperty(photo, "dataUrl", {
        get: () => photo.variants[photo.choice],
        enumerable: true
      });
      return photo;
    }

    const initial = prepareCutOut(img);
    const product = initial && productCanvas(initial);
    if (!product) {
      photo.mode = "studio-photo";
      photo.variants = {};
      for (const variant of ["standard", "accent"]) {
        const fresh = newCanvas();
        composeFullPhoto(context(fresh), img, { accent: variant === "accent" });
        photo.variants[variant] = fresh.toDataURL("image/jpeg", quality);
      }
      photo.choice = averageBrightness(img) < 85 ? "accent" : "standard";
      delete photo.dataUrl;
      Object.defineProperty(photo, "dataUrl", {
        get: () => photo.variants[photo.choice],
        enumerable: true
      });
      return photo;
    }

    const state = initial;
    const firstMask = state.background.slice();
    let placement;
    photo.mode = "studio";
    photo.canEdit = true;
    photo.variants = {};
    delete photo.dataUrl;
    Object.defineProperty(photo, "dataUrl", {
      get: () => photo.variants[photo.choice],
      enumerable: true
    });

    const renderVariants = (current) => {
      for (const variant of ["standard", "accent"]) {
        const fresh = newCanvas();
        placement = composeCutOut(context(fresh), current, { accent: variant === "accent", stand });
        photo.variants[variant] = fresh.toDataURL("image/jpeg", quality);
      }
    };
    renderVariants(product);
    photo.choice = placement.dark ? "accent" : "standard";

    const render = () => {
      const current = productCanvas(state);
      if (!current) return false;
      renderVariants(current);
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
