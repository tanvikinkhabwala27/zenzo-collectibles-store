// Turns an uploaded product photo into a square "Zenzo studio" shot that
// matches the storefront showcase photos: the product on a dark stage with a
// red glow on the left, a blue glow on the right and a glossy floor.
(function () {
  const size = 1200;
  const workingSize = 1600;
  const quality = 0.9;

  // The empty background of the accessory photos (taken from the paw
  // keychain photo), so edited accessories match the real ones exactly.
  let accessoryBackdrop = null;
  let backdropLoad = null;
  function loadBackdrop() {
    backdropLoad ||= new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        accessoryBackdrop = img;
        resolve();
      };
      img.onerror = () => resolve();
      img.src = "assets/accessories/backdrop.jpg";
    });
    return backdropLoad;
  }

  function context(canvas, options) {
    const ctx = canvas.getContext("2d", options);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    return ctx;
  }

  function decodeImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
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

  // iPhone photos are often HEIC, which most browsers other than Safari
  // cannot open. Those are decoded in the browser with libheif (loaded only
  // when needed) and returned as a canvas, which works everywhere an image
  // does here.
  let heifLibrary = null;
  async function decodeHeic(file) {
    heifLibrary ||= loadScript("assets/studio/libheif-bundle.js")
      .then(() => (typeof window.libheif === "function" ? window.libheif() : window.libheif))
      .catch((error) => {
        heifLibrary = null;
        throw error;
      });
    const lib = await heifLibrary;
    const decoder = new lib.HeifDecoder();
    const image = decoder.decode(new Uint8Array(await file.arrayBuffer()))[0];
    if (!image) throw new Error("No image in this HEIC file.");
    const width = image.get_width();
    const height = image.get_height();
    const pixels = await new Promise((resolve, reject) => {
      image.display({ data: new Uint8ClampedArray(width * height * 4), width, height }, (result) => (result ? resolve(result) : reject(new Error("HEIC decode failed."))));
    });
    const full = document.createElement("canvas");
    full.width = width;
    full.height = height;
    context(full).putImageData(new ImageData(pixels.data, width, height), 0, 0);
    // Phone photos are very large; the editor never needs more than this.
    const scale = Math.min(1, 3000 / Math.max(width, height));
    if (scale === 1) return full;
    const smaller = document.createElement("canvas");
    smaller.width = Math.round(width * scale);
    smaller.height = Math.round(height * scale);
    context(smaller).drawImage(full, 0, 0, smaller.width, smaller.height);
    return smaller;
  }

  async function loadImage(file) {
    try {
      return await decodeImage(file);
    } catch (error) {
      const heic = /\.(heic|heif)$/i.test(file.name || "") || /hei[cf]/i.test(file.type || "");
      if (!heic) throw error;
      try {
        return await decodeHeic(file);
      } catch {
        throw new Error("This iPhone (HEIC) photo could not be opened. Try again, or export it as JPEG.");
      }
    }
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

  // legacy: the stage as earlier versions drew it (a table with a hard top
  // edge), only used to recognise photos made then.
  function drawStage(ctx, { floor = true, legacy = false } = {}) {
    ctx.fillStyle = "#05070b";
    ctx.fillRect(0, 0, size, size);
    drawLights(ctx);
    if (!floor) return;
    if (legacy) {
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
      return;
    }
    // The floor fades in softly, with no edge line and no reflection, so the
    // photo stays clean.
    const top = size * 0.62;
    const shade = ctx.createLinearGradient(0, top, 0, size);
    shade.addColorStop(0, "rgba(2, 3, 4, 0)");
    shade.addColorStop(1, "rgba(2, 3, 4, 0.55)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, top, size, size - top);
  }

  // The black display base every product sits on, as in the showcase photos.
  function drawPedestal(ctx, centerX, topY, width, { legacy = false } = {}) {
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
    if (!legacy) {
      ctx.restore();
      return;
    }
    // Earlier versions drew a soft reflection of the base on the table.
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

  // AI cut-out: the U²-Net-p segmentation model (Apache-2.0) run in the
  // browser with ONNX Runtime Web (MIT), both served from assets/studio.
  // It finds the product itself, so fuzzy edges, dark parts and busy or
  // textured backgrounds work, unlike the colour-based flood fill below,
  // which stays as the fallback when the model cannot load.
  // Two models: ISNet (Apache-2.0, int8-compressed, 46 MB, 1024 px), which
  // keeps whole products with fine detail, and U²-Net-p (4.6 MB, 320 px) as
  // the fallback if ISNet cannot load (an old or low-memory computer).
  const models = [
    { url: "assets/studio/isnet-q8.onnx", size: 1024, mean: [0.5, 0.5, 0.5], deviation: [1, 1, 1] },
    { url: "assets/studio/u2netp.onnx", size: 320, mean: [0.485, 0.456, 0.406], deviation: [0.229, 0.224, 0.225] }
  ];
  let segmenter = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error("The photo tool could not load."));
      document.head.append(script);
    });
  }

  function loadSegmenter() {
    segmenter ||= (async () => {
      if (!window.ort) await loadScript("assets/studio/ort.wasm.min.js");
      window.ort.env.wasm.wasmPaths = new URL("assets/studio/", window.location.href).href;
      // Several threads when the admin page is cross-origin isolated (set in
      // vercel.json), which makes cut-outs several times faster.
      window.ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      for (const model of models) {
        try {
          const session = await window.ort.InferenceSession.create(model.url, { executionProviders: ["wasm"] });
          return { session, model };
        } catch {
          // Try the next, smaller model.
        }
      }
      throw new Error("The photo tool could not load.");
    })().catch((error) => {
      segmenter = null;
      throw error;
    });
    return segmenter;
  }

  // Probability (0 to 1) that each pixel of a width x height copy of the
  // photo is product.
  async function productProbability(img, width, height) {
    const { session, model } = await loadSegmenter();
    const modelSize = model.size;
    const input = document.createElement("canvas");
    input.width = modelSize;
    input.height = modelSize;
    const inputCtx = context(input, { willReadFrequently: true });
    inputCtx.drawImage(img, 0, 0, modelSize, modelSize);
    const pixels = inputCtx.getImageData(0, 0, modelSize, modelSize).data;
    const plane = modelSize * modelSize;
    const tensor = new Float32Array(plane * 3);
    const { mean, deviation } = model;
    for (let p = 0; p < plane; p += 1) {
      for (let c = 0; c < 3; c += 1) tensor[c * plane + p] = (pixels[p * 4 + c] / 255 - mean[c]) / deviation[c];
    }
    const feeds = { [session.inputNames[0]]: new window.ort.Tensor("float32", tensor, [1, 3, modelSize, modelSize]) };
    const result = await session.run(feeds);
    const map = result[session.outputNames[0]].data;
    let low = Infinity;
    let high = -Infinity;
    for (let p = 0; p < plane; p += 1) {
      if (map[p] < low) low = map[p];
      if (map[p] > high) high = map[p];
    }
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = modelSize;
    maskCanvas.height = modelSize;
    const maskCtx = context(maskCanvas, { willReadFrequently: true });
    const mask = maskCtx.createImageData(modelSize, modelSize);
    for (let p = 0; p < plane; p += 1) {
      const value = Math.round(((map[p] - low) / (high - low || 1)) * 255);
      mask.data[p * 4] = value;
      mask.data[p * 4 + 3] = 255;
    }
    maskCtx.putImageData(mask, 0, 0);
    const full = document.createElement("canvas");
    full.width = width;
    full.height = height;
    const fullCtx = context(full, { willReadFrequently: true });
    fullCtx.drawImage(maskCanvas, 0, 0, width, height);
    const scaled = fullCtx.getImageData(0, 0, width, height).data;
    const probability = new Float32Array(width * height);
    for (let p = 0; p < probability.length; p += 1) probability[p] = scaled[p * 4] / 255;
    return probability;
  }

  // Mean over a (2r+1) square around each pixel, using a summed-area table.
  function boxMean(values, width, height, r) {
    const sums = new Float64Array((width + 1) * (height + 1));
    for (let y = 0; y < height; y += 1) {
      let row = 0;
      for (let x = 0; x < width; x += 1) {
        row += values[y * width + x];
        sums[(y + 1) * (width + 1) + x + 1] = sums[y * (width + 1) + x + 1] + row;
      }
    }
    const out = new Float32Array(width * height);
    for (let y = 0; y < height; y += 1) {
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(height, y + r + 1);
      for (let x = 0; x < width; x += 1) {
        const x0 = Math.max(0, x - r);
        const x1 = Math.min(width, x + r + 1);
        const sum = sums[y1 * (width + 1) + x1] - sums[y0 * (width + 1) + x1] - sums[y1 * (width + 1) + x0] + sums[y0 * (width + 1) + x0];
        out[y * width + x] = sum / ((y1 - y0) * (x1 - x0));
      }
    }
    return out;
  }

  // Colour guided filter (He, Sun and Tang): snaps a rough mask to the edges
  // in the photo, so the model's soft, slightly wide outline follows the
  // real outline of the product, fibres and thin metal included.
  function guidedFilter(data, mask, width, height, r, eps) {
    const total = width * height;
    const channel = [0, 1, 2].map((c) => {
      const values = new Float32Array(total);
      for (let p = 0; p < total; p += 1) values[p] = data[p * 4 + c] / 255;
      return values;
    });
    const product = (a, b) => {
      const values = new Float32Array(total);
      for (let p = 0; p < total; p += 1) values[p] = a[p] * b[p];
      return values;
    };
    const mean = channel.map((values) => boxMean(values, width, height, r));
    const meanMask = boxMean(mask, width, height, r);
    const meanTimesMask = channel.map((values) => boxMean(product(values, mask), width, height, r));
    const pairs = [[0, 0], [0, 1], [0, 2], [1, 1], [1, 2], [2, 2]];
    const meanPairs = pairs.map(([i, j]) => boxMean(product(channel[i], channel[j]), width, height, r));
    const a = [new Float32Array(total), new Float32Array(total), new Float32Array(total)];
    const b = new Float32Array(total);
    for (let p = 0; p < total; p += 1) {
      const m = [mean[0][p], mean[1][p], mean[2][p]];
      const rr = meanPairs[0][p] - m[0] * m[0] + eps;
      const rg = meanPairs[1][p] - m[0] * m[1];
      const rb = meanPairs[2][p] - m[0] * m[2];
      const gg = meanPairs[3][p] - m[1] * m[1] + eps;
      const gb = meanPairs[4][p] - m[1] * m[2];
      const bb = meanPairs[5][p] - m[2] * m[2] + eps;
      const cov = [0, 1, 2].map((c) => meanTimesMask[c][p] - m[c] * meanMask[p]);
      // Inverse of the symmetric 3x3 covariance.
      const i00 = gg * bb - gb * gb;
      const i01 = rb * gb - rg * bb;
      const i02 = rg * gb - rb * gg;
      const i11 = rr * bb - rb * rb;
      const i12 = rb * rg - rr * gb;
      const i22 = rr * gg - rg * rg;
      const det = rr * i00 + rg * i01 + rb * i02;
      const a0 = (i00 * cov[0] + i01 * cov[1] + i02 * cov[2]) / det;
      const a1 = (i01 * cov[0] + i11 * cov[1] + i12 * cov[2]) / det;
      const a2 = (i02 * cov[0] + i12 * cov[1] + i22 * cov[2]) / det;
      a[0][p] = a0;
      a[1][p] = a1;
      a[2][p] = a2;
      b[p] = meanMask[p] - a0 * m[0] - a1 * m[1] - a2 * m[2];
    }
    const meanA = a.map((values) => boxMean(values, width, height, r));
    const meanB = boxMean(b, width, height, r);
    const out = new Float32Array(total);
    for (let p = 0; p < total; p += 1) {
      const value = meanA[0][p] * channel[0][p] + meanA[1][p] * channel[1][p] + meanA[2][p] * channel[2][p] + meanB[p];
      out[p] = Math.min(1, Math.max(0, value));
    }
    return out;
  }

  // Finds key rings: round metal loops with the backdrop showing inside and
  // around them. Circles are found by letting each strong edge vote for
  // centres along its gradient, then each candidate is checked: backdrop
  // inside, backdrop around it, and a visible metal edge along the circle.
  // Paw pads, buttons and printed circles fail those checks. Returns
  // [{ x, y, r }] in working pixels.
  function findKeyRings(state, backdrop) {
    const { data, width } = state;
    const total = width * (data.length / 4 / width);
    const height = total / width;
    const step = 2;
    const w = Math.floor(width / step);
    const h = Math.floor(height / step);
    const gray = new Float32Array(w * h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = ((y * step) * width + x * step) * 4;
        gray[y * w + x] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      }
    }
    const longest = Math.max(w, h);
    const minR = Math.round(longest * 0.025);
    const maxR = Math.round(longest * 0.09);
    const votes = new Float32Array(w * h);
    const edges = [];
    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        const p = y * w + x;
        const gx = gray[p - w + 1] + 2 * gray[p + 1] + gray[p + w + 1] - gray[p - w - 1] - 2 * gray[p - 1] - gray[p + w - 1];
        const gy = gray[p + w - 1] + 2 * gray[p + w] + gray[p + w + 1] - gray[p - w - 1] - 2 * gray[p - w] - gray[p - w + 1];
        const magnitude = Math.hypot(gx, gy);
        if (magnitude < 120) continue;
        edges.push(p);
        const dx = gx / magnitude;
        const dy = gy / magnitude;
        for (const sign of [-1, 1]) {
          for (let r = minR; r <= maxR; r += 1) {
            const cx = Math.round(x + sign * dx * r);
            const cy = Math.round(y + sign * dy * r);
            if (cx < 0 || cy < 0 || cx >= w || cy >= h) break;
            votes[cy * w + cx] += 1;
          }
        }
      }
    }
    const smooth = boxMean(votes, w, h, 2);
    const backdropSum = backdrop[0] + backdrop[1] + backdrop[2];
    // The backdrop, or a lighter or darker shade of it (the ring's own
    // shadow on a wall or cloth).
    const closeToBackdrop = (x, y) => distance(data, ((Math.round(y) * step) * width + Math.round(x) * step) * 4, ...backdrop) < 60;
    const looksLikeBackdrop = (x, y) => {
      const i = ((Math.round(y) * step) * width + Math.round(x) * step) * 4;
      if (distance(data, i, ...backdrop) < 60) return true;
      const sum = data[i] + data[i + 1] + data[i + 2];
      const level = sum / backdropSum;
      if (level < 0.35 || level > 1.15) return false;
      for (let c = 0; c < 3; c += 1) if (Math.abs(data[i + c] / sum - backdrop[c] / backdropSum) > 0.045) return false;
      return true;
    };
    const rings = [];
    for (let attempt = 0; attempt < 8; attempt += 1) {
      let best = -1;
      for (let p = 0; p < w * h; p += 1) if (best < 0 || smooth[p] > smooth[best]) best = p;
      if (best < 0 || smooth[best] < 2) break;
      const cx = best % w;
      const cy = (best - cx) / w;
      // Clear the area around this peak before looking for the next one.
      for (let y = Math.max(0, cy - minR); y < Math.min(h, cy + minR); y += 1) {
        for (let x = Math.max(0, cx - minR); x < Math.min(w, cx + minR); x += 1) smooth[y * w + x] = 0;
      }
      // Radius: the distance most edge pixels share.
      const counts = new Uint32Array(maxR + 2);
      for (const p of edges) {
        const ex = p % w;
        const d = Math.round(Math.hypot(ex - cx, (p - ex) / w - cy));
        if (d >= minR && d <= maxR) counts[d] += 1;
      }
      let r = minR;
      for (let d = minR; d <= maxR; d += 1) if (counts[d] > counts[r]) r = d;
      // Checks, sampled around the circle.
      const share = (test) => {
        let yes = 0;
        let all = 0;
        for (let y = Math.max(0, cy - r * 1.3); y < Math.min(h, cy + r * 1.3); y += 2) {
          for (let x = Math.max(0, cx - r * 1.3); x < Math.min(w, cx + r * 1.3); x += 2) {
            const d = Math.hypot(x - cx, y - cy);
            const result = test(d, x, y);
            if (result === null) continue;
            all += 1;
            if (result) yes += 1;
          }
        }
        return all ? yes / all : 0;
      };
      const inside = share((d, x, y) => (d < r * 0.75 ? looksLikeBackdrop(x, y) : null));
      const around = share((d, x, y) => (d > r * 1.12 && d < r * 1.3 ? looksLikeBackdrop(x, y) : null));
      // The metal edge is judged by colour alone: grey metal would pass as
      // a shade of the backdrop.
      const rim = share((d, x, y) => (Math.abs(d - r) < 2.5 ? !closeToBackdrop(x, y) : null));
      // A key ring is a thin band: just inside and just outside the metal
      // there is backdrop again. A paw pad or a button is surrounded by thick
      // product instead.
      const thin = share((d, x, y) => {
        const off = Math.abs(d - r);
        return off > r * 0.14 && off < r * 0.28 ? looksLikeBackdrop(x, y) : null;
      });
      // Inside may be partly covered by what hangs through the ring (a hook).
      if (inside >= 0.6 && around >= 0.6 && rim >= 0.55 && thin >= 0.7) rings.push({ x: cx * step, y: cy * step, r: r * step });
    }
    return rings;
  }

  // Repairs only the detected key-ring band and the chain connected to it.
  // Geometry supplies the missing alpha; RGB always comes from the photo.
  function repairKeyRingHardware(state, backdrop, confidence, detail, candidate, rings) {
    const { data, background, width } = state;
    const total = background.length;
    const height = total / width;
    const before = background.slice();
    const backdropSum = backdrop[0] + backdrop[1] + backdrop[2];
    const backdropTone = (p) => {
      const i = p * 4;
      const sum = data[i] + data[i + 1] + data[i + 2];
      const level = sum / backdropSum;
      if (level < 0.12 || level > 1.2) return false;
      for (let c = 0; c < 3; c += 1) {
        if (Math.abs(data[i + c] / sum - backdrop[c] / backdropSum) > 0.06) return false;
      }
      return true;
    };
    const clothTone = (p) => {
      const i = p * 4;
      const sum = data[i] + data[i + 1] + data[i + 2];
      const level = sum / backdropSum;
      if (level < 0.18 || level > 1.15) return false;
      for (let c = 0; c < 3; c += 1) {
        if (Math.abs(data[i + c] / sum - backdrop[c] / backdropSum) > 0.025) return false;
      }
      return true;
    };
    const restore = (p) => {
      background[p] = 0;
      candidate[p] = 0;
      data[p * 4 + 3] = 255;
    };
    const clear = (p) => {
      background[p] = 1;
      candidate[p] = 0;
      data[p * 4 + 3] = 0;
    };

    for (const ring of rings) {
      const samples = Math.max(120, Math.round(Math.PI * ring.r));
      const halfBand = Math.max(3, ring.r * 0.06);
      const search = Math.max(3, Math.round(halfBand));
      const centres = new Float32Array(samples);
      const supported = new Uint8Array(samples);
      const at = (radius, angle) => {
        const x = Math.round(ring.x + Math.cos(angle) * radius);
        const y = Math.round(ring.y + Math.sin(angle) * radius);
        return x < 0 || y < 0 || x >= width || y >= height ? -1 : y * width + x;
      };

      // Follow the two real metal edges around the circle instead of using a
      // single wide annulus, so cloth next to a tilted ring is not restored.
      for (let a = 0; a < samples; a += 1) {
        const angle = (a * Math.PI * 2) / samples;
        let bestScore = -1;
        let bestShift = 0;
        for (let shift = -search; shift <= search; shift += 1) {
          const inner = at(ring.r + shift - halfBand, angle);
          const middle = at(ring.r + shift, angle);
          const outer = at(ring.r + shift + halfBand, angle);
          if (inner < 0 || middle < 0 || outer < 0) continue;
          const pair = Math.min(detail[inner], detail[outer]);
          const score = pair * 2 + (detail[inner] + detail[outer]) * 0.5
            + detail[middle] * 0.15 + (!before[middle] ? 30 : 0);
          if (score > bestScore) {
            bestScore = score;
            bestShift = shift;
          }
        }
        centres[a] = ring.r + bestShift;
        if (bestScore > 150) supported[a] = 1;
      }

      const smooth = centres.slice();
      for (let a = 0; a < samples; a += 1) {
        let sum = 0;
        let count = 0;
        for (let offset = -8; offset <= 8; offset += 1) {
          const n = (a + offset + samples) % samples;
          if (!supported[n]) continue;
          sum += centres[n];
          count += 1;
        }
        if (count) smooth[a] = sum / count;
      }
      // Bridge only short segmentation breaks. A real opening in the source
      // is longer and remains an opening.
      const solid = supported.slice();
      for (let a = 0; a < samples; a += 1) {
        if (solid[a]) continue;
        for (let gap = 1; gap <= 7; gap += 1) {
          if (supported[(a - gap + samples) % samples] && supported[(a + gap) % samples]) {
            solid[a] = 1;
            break;
          }
        }
      }

      const extent = ring.r + search + halfBand * 2;
      for (let y = Math.max(0, Math.floor(ring.y - extent)); y < Math.min(height, Math.ceil(ring.y + extent)); y += 1) {
        for (let x = Math.max(0, Math.floor(ring.x - extent)); x < Math.min(width, Math.ceil(ring.x + extent)); x += 1) {
          const dx = x - ring.x;
          const dy = y - ring.y;
          const radius = Math.hypot(dx, dy);
          let a = Math.round(((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)) * samples / (Math.PI * 2));
          if (a === samples) a = 0;
          const inner = smooth[a] - halfBand;
          const outer = smooth[a] + halfBand;
          const p = y * width + x;
          if (solid[a] && radius >= inner && radius <= outer) {
            restore(p);
          } else if (radius < inner - 1) {
            clear(p);
          } else if (radius <= outer + halfBand * 1.8 && (backdropTone(p) || confidence[p] < 0.28)) {
            clear(p);
          }
        }
      }

      // The product side has the strongest run of foreground beyond the
      // ring. It defines a narrow chain-only corridor.
      const bins = 72;
      const directionScore = new Float32Array(bins);
      const reach = ring.r * 2.8;
      for (let y = Math.max(0, Math.floor(ring.y - reach)); y < Math.min(height, Math.ceil(ring.y + reach)); y += 1) {
        for (let x = Math.max(0, Math.floor(ring.x - reach)); x < Math.min(width, Math.ceil(ring.x + reach)); x += 1) {
          const dx = x - ring.x;
          const dy = y - ring.y;
          const radius = Math.hypot(dx, dy);
          const p = y * width + x;
          if (radius < ring.r * 1.18 || radius > reach || before[p]) continue;
          if (detail[p] < 60 && backdropTone(p)) continue;
          const angle = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
          directionScore[Math.floor(angle * bins / (Math.PI * 2)) % bins] += 1 + Math.min(3, detail[p] / 120);
        }
      }
      let direction = 0;
      let bestDirection = -1;
      for (let a = 0; a < bins; a += 1) {
        let score = 0;
        for (let offset = -2; offset <= 2; offset += 1) score += directionScore[(a + offset + bins) % bins];
        if (score > bestDirection) {
          bestDirection = score;
          direction = (a * Math.PI * 2) / bins;
        }
      }
      if (bestDirection <= 0) continue;

      const ux = Math.cos(direction);
      const uy = Math.sin(direction);
      const sideLimit = Math.max(halfBand * 4, ring.r * 0.24);
      const x0 = Math.max(0, Math.floor(Math.min(ring.x, ring.x + ux * reach) - sideLimit));
      const y0 = Math.max(0, Math.floor(Math.min(ring.y, ring.y + uy * reach) - sideLimit));
      const x1 = Math.min(width, Math.ceil(Math.max(ring.x, ring.x + ux * reach) + sideLimit));
      const y1 = Math.min(height, Math.ceil(Math.max(ring.y, ring.y + uy * reach) + sideLimit));
      const localWidth = x1 - x0;
      const localHeight = y1 - y0;
      const corridor = new Uint8Array(localWidth * localHeight);
      const raw = new Uint8Array(localWidth * localHeight);
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const dx = x - ring.x;
          const dy = y - ring.y;
          const along = dx * ux + dy * uy;
          const side = Math.abs(dx * uy - dy * ux);
          const q = (y - y0) * localWidth + x - x0;
          if (along < ring.r * 0.72 || along > reach || side > sideLimit) continue;
          corridor[q] = 1;
          const p = y * width + x;
          if (!before[p] && (detail[p] > 90 || (detail[p] > 45 && !backdropTone(p)))) raw[q] = 1;
        }
      }

      // Close one- and two-pixel alpha breaks without growing the chain.
      let closed = raw.slice();
      for (let pass = 0; pass < 2; pass += 1) {
        const grown = closed.slice();
        for (let y = 1; y < localHeight - 1; y += 1) {
          for (let x = 1; x < localWidth - 1; x += 1) {
            const q = y * localWidth + x;
            if (!corridor[q] || closed[q]) continue;
            for (let dy = -1; dy <= 1 && !grown[q]; dy += 1) {
              for (let dx = -1; dx <= 1; dx += 1) if (closed[q + dy * localWidth + dx]) grown[q] = 1;
            }
          }
        }
        closed = grown;
      }
      for (let pass = 0; pass < 2; pass += 1) {
        const shrunk = closed.slice();
        for (let y = 1; y < localHeight - 1; y += 1) {
          for (let x = 1; x < localWidth - 1; x += 1) {
            const q = y * localWidth + x;
            if (!closed[q] || raw[q]) continue;
            for (let dy = -1; dy <= 1; dy += 1) {
              for (let dx = -1; dx <= 1; dx += 1) if (!closed[q + dy * localWidth + dx]) shrunk[q] = 0;
            }
          }
        }
        closed = shrunk;
      }

      // Keep only the closed shape attached to the detected ring.
      const hardware = new Uint8Array(closed.length);
      const queue = [];
      for (let y = 0; y < localHeight; y += 1) {
        for (let x = 0; x < localWidth; x += 1) {
          const q = y * localWidth + x;
          if (!closed[q]) continue;
          const radius = Math.hypot(x + x0 - ring.x, y + y0 - ring.y);
          if (Math.abs(radius - ring.r) <= halfBand * 2) {
            hardware[q] = 1;
            queue.push(q);
          }
        }
      }
      for (let k = 0; k < queue.length; k += 1) {
        const q = queue[k];
        const x = q % localWidth;
        const y = (q - x) / localWidth;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= localWidth || ny >= localHeight) continue;
            const n = ny * localWidth + nx;
            if (closed[n] && !hardware[n]) {
              hardware[n] = 1;
              queue.push(n);
            }
          }
        }
      }

      const floodOutside = (mask) => {
        const result = new Uint8Array(mask.length);
        const open = [];
        for (let q = 0; q < mask.length; q += 1) {
          const x = q % localWidth;
          const y = (q - x) / localWidth;
          if (!mask[q] && (!corridor[q] || x === 0 || y === 0 || x === localWidth - 1 || y === localHeight - 1)) {
            result[q] = 1;
            open.push(q);
          }
        }
        for (let k = 0; k < open.length; k += 1) {
          const q = open[k];
          const x = q % localWidth;
          const y = (q - x) / localWidth;
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= localWidth || ny >= localHeight) continue;
            const n = ny * localWidth + nx;
            if (!mask[n] && !result[n]) {
              result[n] = 1;
              open.push(n);
            }
          }
        }
        return result;
      };

      // The broad AI component can contain a strip of cloth beneath the
      // chain. Link openings give us the real metal geometry: keep only a
      // narrow band around those openings, plus non-cloth connector pixels.
      const initialOutside = floodOutside(hardware);
      let nearHole = new Uint8Array(hardware.length);
      for (let q = 0; q < hardware.length; q += 1) {
        if (corridor[q] && !hardware[q] && !initialOutside[q]) nearHole[q] = 1;
      }
      const linkBand = Math.max(1, Math.min(2, Math.round(halfBand * 0.35)));
      for (let pass = 0; pass < linkBand; pass += 1) {
        const grown = nearHole.slice();
        for (let y = 1; y < localHeight - 1; y += 1) {
          for (let x = 1; x < localWidth - 1; x += 1) {
            const q = y * localWidth + x;
            if (!corridor[q] || nearHole[q]) continue;
            for (let dy = -1; dy <= 1 && !grown[q]; dy += 1) {
              for (let dx = -1; dx <= 1; dx += 1) if (nearHole[q + dy * localWidth + dx]) grown[q] = 1;
            }
          }
        }
        nearHole = grown;
      }
      let supportedMetal = new Uint8Array(hardware.length);
      for (let y = 0; y < localHeight; y += 1) {
        for (let x = 0; x < localWidth; x += 1) {
          const q = y * localWidth + x;
          if (!hardware[q]) continue;
          const p = (y + y0) * width + x + x0;
          if (!clothTone(p) && detail[p] > 25) supportedMetal[q] = 1;
        }
      }
      const bridge = Math.max(2, Math.min(4, Math.round(halfBand * 0.7)));
      for (let pass = 0; pass < 2; pass += 1) {
        const filled = supportedMetal.slice();
        for (let y = bridge; y < localHeight - bridge; y += 1) {
          for (let x = bridge; x < localWidth - bridge; x += 1) {
            const q = y * localWidth + x;
            if (!hardware[q] || !nearHole[q] || supportedMetal[q]) continue;
            for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
              let beforeEdge = false;
              let afterEdge = false;
              for (let step = 1; step <= bridge; step += 1) {
                beforeEdge ||= Boolean(supportedMetal[q - dy * step * localWidth - dx * step]);
                afterEdge ||= Boolean(supportedMetal[q + dy * step * localWidth + dx * step]);
              }
              if (beforeEdge && afterEdge) {
                filled[q] = 1;
                break;
              }
            }
          }
        }
        supportedMetal = filled;
      }
      for (let y = 0; y < localHeight; y += 1) {
        for (let x = 0; x < localWidth; x += 1) {
          const q = y * localWidth + x;
          if (!hardware[q]) continue;
          const radius = Math.hypot(x + x0 - ring.x, y + y0 - ring.y);
          const joinsRing = Math.abs(radius - ring.r) <= halfBand;
          if (!joinsRing && !supportedMetal[q]) hardware[q] = 0;
        }
      }
      for (let y = 0; y < localHeight; y += 1) {
        for (let x = 0; x < localWidth; x += 1) {
          const q = y * localWidth + x;
          if (!hardware[q]) continue;
          restore((y + y0) * width + x + x0);
        }
      }

      // Flood outside the repaired chain. Anything enclosed is a link hole,
      // so cloth and its cast shadow are cleared together.
      const outside = floodOutside(hardware);
      for (let y = 0; y < localHeight; y += 1) {
        for (let x = 0; x < localWidth; x += 1) {
          const q = y * localWidth + x;
          if (corridor[q] && !hardware[q] && !outside[q]) clear((y + y0) * width + x + x0);
        }
      }
      // The corridor ends at the chain attachment, so anything in it that
      // is not supported metal is cloth or cast shadow touching the chain.
      for (let y = 0; y < localHeight; y += 1) {
        for (let x = 0; x < localWidth; x += 1) {
          const q = y * localWidth + x;
          if (!corridor[q] || hardware[q]) continue;
          const p = (y + y0) * width + x + x0;
          clear(p);
        }
      }
    }
  }

  // Cleans the refined outline using the backdrop's colour. Backdrop is a
  // pixel close to the backdrop colour, or a lighter or darker shade of it
  // (a fold, a cast shadow), that is not on a sharp edge: cloth folds are
  // soft, while metal and fibres have sharp detail and stay.
  //  - Backdrop seen through a loop (inside a key ring) is removed when only
  //    a thin part of the product surrounds it; white parts set inside thick
  //    product (the pads of a paw) stay.
  //  - Backdrop along the outside of the outline is removed where the model
  //    is unsure, and close to the outline even where it is sure.
  function clearBackdropInOutline(state, backdrop, confidence) {
    const { data, background, width } = state;
    const total = background.length;
    const height = total / width;
    const lum = new Float32Array(total);
    for (let p = 0; p < total; p += 1) lum[p] = (data[p * 4] + data[p * 4 + 1] + data[p * 4 + 2]) / 3;
    const detail = new Float32Array(total);
    const sharp = new Uint8Array(total);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const p = y * width + x;
        const gx = lum[p - width + 1] + 2 * lum[p + 1] + lum[p + width + 1] - lum[p - width - 1] - 2 * lum[p - 1] - lum[p + width - 1];
        const gy = lum[p + width - 1] + 2 * lum[p + width] + lum[p + width + 1] - lum[p - width - 1] - 2 * lum[p - width] - lum[p - width + 1];
        detail[p] = Math.hypot(gx, gy);
        if (detail[p] > 150) sharp[p] = 1;
      }
    }
    // Widen sharp edges a little so a thin part between two of them (the
    // shiny middle of a metal ring) counts as product too.
    for (let pass = 0; pass < 3; pass += 1) {
      const grown = sharp.slice();
      for (let p = 0; p < total; p += 1) {
        if (sharp[p]) continue;
        const x = p % width;
        if ((x > 0 && sharp[p - 1]) || (x < width - 1 && sharp[p + 1]) || sharp[p - width] || sharp[p + width]) grown[p] = 1;
      }
      sharp.set(grown);
    }
    const backdropSum = backdrop[0] + backdrop[1] + backdrop[2];
    const looksLikeBackdrop = (p) => {
      if (sharp[p]) return false;
      const i = p * 4;
      if (distance(data, i, ...backdrop) < 60) return true;
      const sum = data[i] + data[i + 1] + data[i + 2];
      const level = sum / backdropSum;
      if (level < 0.35 || level > 1.15) return false;
      for (let c = 0; c < 3; c += 1) if (Math.abs(data[i + c] / sum - backdrop[c] / backdropSum) > 0.045) return false;
      return true;
    };
    const candidate = new Uint8Array(total);
    for (let p = 0; p < total; p += 1) if (!background[p] && looksLikeBackdrop(p)) candidate[p] = 1;

    const rings = findKeyRings(state, backdrop);
    repairKeyRingHardware(state, backdrop, confidence, detail, candidate, rings);

    // Backdrop inside key rings, even where the ring has a gap.
    for (const ring of rings) {
      const inner = ring.r - Math.max(3, ring.r * 0.06);
      for (let y = Math.max(0, Math.floor(ring.y - inner)); y < Math.min(height, ring.y + inner); y += 1) {
        for (let x = Math.max(0, Math.floor(ring.x - inner)); x < Math.min(width, ring.x + inner); x += 1) {
          const p = y * width + x;
          if (candidate[p] && Math.hypot(x - ring.x, y - ring.y) < inner) background[p] = 1;
        }
      }
    }

    // Backdrop inside loops.
    const seen = new Uint8Array(total);
    // Small enough for the inside of a chain link.
    const minPatch = total * 0.00006;
    for (let start = 0; start < total; start += 1) {
      if (!candidate[start] || seen[start] || background[start]) continue;
      const patch = [start];
      seen[start] = 1;
      // Truly enclosed only: a patch that reaches the background is part of
      // the product's own outline (white strands), not a hole.
      let open = false;
      for (let k = 0; k < patch.length; k += 1) {
        for (const n of neighbours(patch[k], width, total)) {
          if (background[n]) open = true;
          if (candidate[n] && !seen[n] && !background[n]) {
            seen[n] = 1;
            patch.push(n);
          }
        }
      }
      if (!open && patch.length >= minPatch && thinlyEnclosed(state, patch)) {
        for (const p of patch) background[p] = 1;
      }
    }

    // Backdrop along the outside of the outline.
    let edge = [];
    for (let p = 0; p < total; p += 1) if (background[p]) edge.push(p);
    for (let step = 1; edge.length; step += 1) {
      const next = [];
      for (const p of edge) {
        for (const n of neighbours(p, width, total)) {
          // Only where the model itself is unsure: a white product on white
          // cloth looks like the backdrop but the model knows it is product.
          if (background[n] || !candidate[n] || confidence[n] > 0.5) continue;
          background[n] = 1;
          next.push(n);
        }
      }
      edge = next;
    }
  }

  // Same result shape as prepareCutOut, with soft edges kept in the alpha
  // channel. Returns null when the model is unavailable or finds nothing.
  async function aiCutOut(img) {
    const scale = Math.min(1, workingSize / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    let probability;
    try {
      probability = await productProbability(img, width, height);
    } catch {
      return null;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = context(canvas, { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, width, height);
    const data = ctx.getImageData(0, 0, width, height).data;
    const source = new Uint8ClampedArray(data);
    const total = width * height;
    const background = new Uint8Array(total);
    const rough = new Float32Array(total);
    for (let p = 0; p < total; p += 1) {
      // Firm up the upscaled mask before refining it.
      const t = Math.min(1, Math.max(0, (probability[p] - 0.25) / 0.5));
      rough[p] = t * t * (3 - 2 * t);
    }
    const refined = guidedFilter(data, rough, width, height, Math.max(4, Math.round(Math.max(width, height) * 0.008)), 0.002);
    let kept = 0;
    for (let p = 0; p < total; p += 1) {
      const t = Math.min(1, Math.max(0, (refined[p] - 0.1) / 0.8));
      const alpha = t * t * (3 - 2 * t);
      data[p * 4 + 3] = Math.round(alpha * 255);
      if (alpha < 0.04) background[p] = 1;
      else kept += 1;
    }
    if (kept < total * 0.005 || kept > total * 0.95) return null;
    const state = { width, height, data, background, source };

    // On a plain backdrop, clear backdrop still showing through loops (a key
    // ring) and take the backdrop's colour out of the soft edges, so no
    // light or coloured fringe shows on the dark stage.
    const border = [];
    for (let x = 0; x < width; x += 1) border.push(x, (height - 1) * width + x);
    for (let y = 0; y < height; y += 1) border.push(y * width, y * width + width - 1);
    const median = (offset) => border.map((p) => data[p * 4 + offset]).sort((a, b) => a - b)[Math.floor(border.length / 2)];
    const backdrop = [median(0), median(1), median(2)];
    const plain = border.filter((p) => distance(data, p * 4, ...backdrop) < 60).length / border.length;
    if (plain > 0.6) {
      clearBackdropInOutline(state, backdrop, rough);
      for (let p = 0; p < total; p += 1) {
        const i = p * 4;
        const alpha = data[i + 3] / 255;
        if (background[p] || alpha > 0.97) continue;
        for (let c = 0; c < 3; c += 1) {
          data[i + c] = Math.min(255, Math.max(0, (data[i + c] - (1 - alpha) * backdrop[c]) / Math.max(alpha, 0.15)));
        }
      }
    }
    keepMainProduct(state);
    return state;
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
    const state = { width, height, data, background: new Uint8Array(width * height), source: new Uint8ClampedArray(data) };

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
    // On neutral backdrops (white cloth, grey paper) only soft shading close
    // to the backdrop is taken, and only near the removed background, so
    // grey or silver product parts stay.
    const neutral = Math.max(...tone.map((t) => Math.abs(t - 1 / 3))) < 0.02;
    const [low, steps] = neutral ? [0.68, Math.round(width * 0.03)] : [0.35, Infinity];
    const isShadow = (p) => {
      const i = p * 4;
      const pixelSum = data[i] + data[i + 1] + data[i + 2];
      const level = pixelSum / sum;
      if (level < low || level > 1.05 || pixelSum < 30) return false;
      return Math.abs(data[i] / pixelSum - tone[0]) < 0.018
        && Math.abs(data[i + 1] / pixelSum - tone[1]) < 0.018
        && Math.abs(data[i + 2] / pixelSum - tone[2]) < 0.018;
    };
    let queue = [];
    for (let p = 0; p < total; p += 1) if (background[p]) queue.push(p);
    for (let step = 0; step < steps && queue.length; step += 1) {
      const next = [];
      for (const p of queue) {
        for (const n of neighbours(p, width, total)) {
          if (!background[n] && isShadow(n)) {
            background[n] = 1;
            next.push(n);
          }
        }
      }
      queue = next;
    }
  }

  // Backdrop showing through enclosed gaps (inside a loop track, between
  // parts) cannot be reached from the photo's edges. Remove sizeable patches
  // that are flat and almost exactly the backdrop colour; shaded product
  // surfaces such as white packaging vary too much to qualify.
  function removeEnclosedBackdrop(state, [r, g, b], { minShare = 0.002 } = {}) {
    const { data, background, width } = state;
    const total = background.length;
    const minPatch = total * minShare;
    let removed = 0;
    // First flat patches close to the backdrop colour, then (with a looser
    // colour match) textured ones such as fabric showing inside a key ring.
    for (const [tolerance, textured] of [[24, false], [55, true]]) {
      const seen = new Uint8Array(total);
      for (let start = 0; start < total; start += 1) {
        if (background[start] || seen[start] || distance(data, start * 4, r, g, b) >= tolerance) continue;
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
            if (seen[n] || background[n] || distance(data, n * 4, r, g, b) >= tolerance) continue;
            seen[n] = 1;
            patch.push(n);
          }
        }
        if (patch.length < minPatch) continue;
        const mean = sum / patch.length;
        const spread = Math.sqrt(Math.max(0, sumSquares / patch.length - mean * mean)) / 3;
        // Flat patches are backdrop. Textured ones are backdrop only when a
        // thin part of the product surrounds them, like a key ring; white
        // parts set inside thicker product (the pads of a paw) stay.
        if (textured ? thinlyEnclosed(state, patch) : spread < 6) {
          for (const p of patch) background[p] = 1;
          removed += patch.length;
        }
      }
    }
    return removed;
  }

  // True when the background outside is reached within a few pixels of the
  // patch, all along a good part of its edge.
  function thinlyEnclosed(state, patch) {
    const { background, width } = state;
    const total = background.length;
    const reach = Math.max(8, Math.round(Math.max(width, total / width) * 0.016));
    const seen = new Set(patch);
    let frontier = patch;
    let edge = 0;
    let open = 0;
    for (let step = 1; step <= reach && frontier.length; step += 1) {
      const next = [];
      for (const p of frontier) {
        for (const n of neighbours(p, width, total)) {
          if (seen.has(n)) continue;
          seen.add(n);
          if (step === 1) edge += 1;
          if (background[n]) {
            open += 1;
            continue;
          }
          next.push(n);
        }
      }
      frontier = next;
    }
    // A thin surround lets the growth reach the outside along most of the
    // patch's edge; a thick one never reaches it.
    return edge > 0 && open / edge > 0.3;
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

  // bounds { minX, minY, width, height } keeps the product's frame fixed
  // (while brushing, so it does not move or resize as edges are erased).
  function productCanvas(state, bounds = null) {
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
    if (bounds) {
      minX = bounds.minX;
      minY = bounds.minY;
      maxX = bounds.minX + bounds.width - 1;
      maxY = bounds.minY + bounds.height - 1;
    }
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
  // The product photo on the background, and nothing else: no stand,
  // shadow, glow or colour change, so it looks exactly as it is.
  function composeFloating(ctx, product, { zoom = 1, offsetX = 0, offsetY = 0, background = 0 } = {}) {
    if (accessoryBackdrop) {
      ctx.drawImage(accessoryBackdrop, 0, 0, size, size);
    } else {
      ctx.fillStyle = "#0a0b0f";
      ctx.fillRect(0, 0, size, size);
      drawLights(ctx, 0.38, 0.62);
    }
    if (background > 0) {
      // Behind dark products: a soft, deep red glow in the middle that fades
      // into the dark edges, in the shop's red and dark colours.
      ctx.save();
      const glow = ctx.createRadialGradient(size / 2, size * 0.47, 0, size / 2, size * 0.47, size * 0.62);
      for (const [stop, alpha] of [[0, 1], [0.35, 0.85], [0.65, 0.4], [1, 0]]) {
        glow.addColorStop(stop, `rgba(150, 26, 38, ${alpha * background})`);
      }
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = `rgba(70, 10, 18, ${background * 0.35})`;
      ctx.fillRect(0, 0, size, size);
      ctx.restore();
    }
    const image = product.canvas;
    // Same size and position as the product in the accessory photos.
    const scale = Math.min((size * 0.6) / image.width, (size * 0.66) / image.height, 2) * zoom;
    const width = image.width * scale;
    const height = image.height * scale;
    const x = (size - width) / 2 + offsetX * size;
    const y = Math.min(size * 0.47 - height / 2, size * 0.8 - height) + offsetY * size;
    const scaled = document.createElement("canvas");
    scaled.width = Math.max(1, Math.round(width));
    scaled.height = Math.max(1, Math.round(height));
    context(scaled).drawImage(image, 0, 0, scaled.width, scaled.height);
    // Only an enlarged photo gets light sharpening, to undo the blur of
    // enlarging.
    if (scale > 1) sharpen(scaled, 0.35);
    ctx.drawImage(scaled, x, y, width, height);
    return { x, y, scale, minX: product.minX, minY: product.minY };
  }

  // The whole photo, cropped square, as an opaque layer the editing tools can
  // work on (see createStudioPhoto).
  function fullFrameState(img) {
    const canvas = newCanvas();
    const frameCtx = context(canvas, { willReadFrequently: true });
    composeOriginal(frameCtx, img);
    const data = frameCtx.getImageData(0, 0, size, size).data;
    return { width: size, height: size, data, background: new Uint8Array(size * size), source: new Uint8ClampedArray(data), underlay: photoBackdrop(canvas) };
  }

  // A smooth continuation of a photo's own background, made from the colours
  // along its edges (filled inwards as a gentle gradient). It sits under a
  // full photo layer, so erased areas blend into the photo's own background.
  function photoBackdrop(photoCanvas) {
    const cells = 48;
    const small = document.createElement("canvas");
    small.width = cells;
    small.height = cells;
    const smallCtx = context(small, { willReadFrequently: true });
    smallCtx.drawImage(photoCanvas, 0, 0, cells, cells);
    const pixels = smallCtx.getImageData(0, 0, cells, cells);
    const colour = new Float32Array(cells * cells * 3);
    const known = new Uint8Array(cells * cells);
    for (let y = 0; y < cells; y += 1) {
      for (let x = 0; x < cells; x += 1) {
        const c = y * cells + x;
        for (let k = 0; k < 3; k += 1) colour[c * 3 + k] = pixels.data[c * 4 + k];
        if (x < 2 || y < 2 || x >= cells - 2 || y >= cells - 2) known[c] = 1;
      }
    }
    // Relax the inside towards the average of its neighbours.
    for (let pass = 0; pass < 400; pass += 1) {
      for (let y = 1; y < cells - 1; y += 1) {
        for (let x = 1; x < cells - 1; x += 1) {
          const c = y * cells + x;
          if (known[c]) continue;
          for (let k = 0; k < 3; k += 1) {
            colour[c * 3 + k] = (colour[(c - 1) * 3 + k] + colour[(c + 1) * 3 + k] + colour[(c - cells) * 3 + k] + colour[(c + cells) * 3 + k]) / 4;
          }
        }
      }
    }
    for (let c = 0; c < cells * cells; c += 1) {
      for (let k = 0; k < 3; k += 1) pixels.data[c * 4 + k] = colour[c * 3 + k];
      pixels.data[c * 4 + 3] = 255;
    }
    smallCtx.putImageData(pixels, 0, 0);
    const underlay = newCanvas();
    const underlayCtx = context(underlay);
    underlayCtx.filter = "blur(24px)";
    underlayCtx.drawImage(small, -cells, -cells, size + cells * 2, size + cells * 2);
    return underlay;
  }

  // The full photo layer over the studio background: unchanged until the
  // admin erases part of it, zooms out or turns it.
  function composeFullFrame(ctx, product, { zoom = 1, offsetX = 0, offsetY = 0, background = 0, underlay = null } = {}) {
    if (underlay) {
      ctx.drawImage(underlay, 0, 0, size, size);
    } else if (accessoryBackdrop) {
      ctx.drawImage(accessoryBackdrop, 0, 0, size, size);
    } else {
      ctx.fillStyle = "#0a0b0f";
      ctx.fillRect(0, 0, size, size);
      drawLights(ctx, 0.38, 0.62);
    }
    if (background > 0) {
      ctx.save();
      const glow = ctx.createRadialGradient(size / 2, size * 0.47, 0, size / 2, size * 0.47, size * 0.62);
      for (const [stop, alpha] of [[0, 1], [0.35, 0.85], [0.65, 0.4], [1, 0]]) {
        glow.addColorStop(stop, `rgba(150, 26, 38, ${alpha * background})`);
      }
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);
      ctx.restore();
    }
    const image = product.canvas;
    const scale = Math.max(size / image.width, size / image.height) * zoom;
    const width = image.width * scale;
    const height = image.height * scale;
    const x = (size - width) / 2 + offsetX * size;
    const y = (size - height) / 2 + offsetY * size;
    ctx.drawImage(image, x, y, width, height);
    return { x, y, scale, minX: product.minX, minY: product.minY };
  }

  // accent: false draws the standard look; true adds the red and blue edge
  // light, stronger for darker products. stand: false uses the accessory
  // look without the display base.
  function composeCutOut(ctx, product, { accent = false, stand = false, zoom = 1, offsetX = 0, offsetY = 0, background = 0 } = {}) {
    if (!stand) return composeFloating(ctx, product, { zoom, offsetX, offsetY, background });
    drawStage(ctx);
    const image = product.canvas;
    // Enlarging a small photo more than this only adds blur, so small
    // products are shown a little smaller instead.
    const maxEnlarge = 2;
    const scale = Math.min((size * 0.72) / image.width, (size * 0.5) / image.height, maxEnlarge) * zoom;
    const width = image.width * scale;
    const height = image.height * scale;
    // On the stand the product can move sideways but always stands on it.
    const x = (size - width) / 2 + offsetX * size;
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
    ctx.ellipse(x + width / 2, baseline - 2, width * 0.44, Math.max(6, size * 0.012), 0, 0, Math.PI * 2);
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
    drawStage(plainCtx, { legacy: true });
    drawPedestal(plainCtx, size / 2, size * 0.712, size * 0.86, { legacy: true });
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
  function keepMainProduct(state, { below = Infinity } = {}) {
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
    if (pieces.length < 2 && below === Infinity) return;
    const candidates = pieces.filter((piece) => piece.minY < below);
    if (!candidates.length) return;
    const main = candidates.reduce((a, b) => (b.area > a.area ? b : a));
    const margin = width * 0.04;
    const keep = new Uint8Array(pieces.length + 1);
    for (const piece of pieces) {
      const near = piece.maxX >= main.minX - margin && piece.minX <= main.maxX + margin
        && piece.maxY >= main.minY - margin && piece.minY <= main.maxY + margin;
      keep[piece.id] = piece === main || (near && piece.area >= Math.max(30, width * height * 0.0003) && piece.minY < below) ? 1 : 0;
    }
    for (let p = 0; p < width * height; p += 1) {
      if (label[p] && !keep[label[p]]) background[p] = 1;
    }
  }

  async function aiProduct(img) {
    const state = await aiCutOut(img);
    return state && productCanvas(state);
  }

  // True when the photo already sits on the accessory background (the launch
  // accessory photos), so it is kept as it is.
  function matchesAccessoryBackdrop(img) {
    if (!accessoryBackdrop) return false;
    const sample = (source) => {
      const canvas = document.createElement("canvas");
      canvas.width = 48;
      canvas.height = 48;
      const sampleCtx = context(canvas, { willReadFrequently: true });
      sampleCtx.drawImage(source, 0, 0, 48, 48);
      return sampleCtx.getImageData(0, 0, 48, 48).data;
    };
    const a = sample(img);
    const b = sample(accessoryBackdrop);
    let total = 0;
    let count = 0;
    for (let y = 0; y < 48; y += 1) {
      for (let x = 0; x < 48; x += 1) {
        if (x > 6 && x < 41 && y > 6 && y < 41) continue;
        const i = (y * 48 + x) * 4;
        total += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        count += 3;
      }
    }
    return total / count < 9;
  }

  // Photos on some other dark background (a dark stage with a glossy floor,
  // say): the backdrop is smooth, so the product is what stands out from a
  // heavily blurred copy of it. Dark parts enclosed by the product's outline
  // are kept, and the floor reflection below the horizon is dropped.
  function extractFromDarkPhoto(img) {
    const work = 800;
    const canvas = document.createElement("canvas");
    canvas.width = work;
    canvas.height = work;
    const workCtx = context(canvas, { willReadFrequently: true });
    const scale = Math.max(work / img.width, work / img.height);
    workCtx.drawImage(img, (work - img.width * scale) / 2, (work - img.height * scale) / 2, img.width * scale, img.height * scale);
    const data = workCtx.getImageData(0, 0, work, work).data;
    const total = work * work;
    const lum = new Float32Array(total);
    for (let p = 0; p < total; p += 1) lum[p] = data[p * 4] * 0.299 + data[p * 4 + 1] * 0.587 + data[p * 4 + 2] * 0.114;

    // Smooth backdrop estimate, ignoring the product on the second pass.
    const blurred = (weights) => {
      const small = 50;
      const sums = new Float32Array(small * small * 4);
      const cell = work / small;
      for (let p = 0; p < total; p += 1) {
        const w = weights ? weights[p] : 1;
        if (!w) continue;
        const x = p % work;
        const y = (p - x) / work;
        const c = (Math.floor(y / cell) * small + Math.floor(x / cell)) * 4;
        sums[c] += data[p * 4];
        sums[c + 1] += data[p * 4 + 1];
        sums[c + 2] += data[p * 4 + 2];
        sums[c + 3] += 1;
      }
      // Average each cell; cells covered by the product take the average of
      // their filled neighbours, spreading inwards until all are filled.
      const colour = new Float32Array(small * small * 3);
      const filled = new Uint8Array(small * small);
      for (let c = 0; c < small * small; c += 1) {
        if (sums[c * 4 + 3] < cell) continue;
        for (let k = 0; k < 3; k += 1) colour[c * 3 + k] = sums[c * 4 + k] / sums[c * 4 + 3];
        filled[c] = 1;
      }
      for (let pass = 0; pass < small; pass += 1) {
        const ready = filled.slice();
        let missing = 0;
        for (let c = 0; c < small * small; c += 1) {
          if (ready[c]) continue;
          const x = c % small;
          const near = [x > 0 ? c - 1 : -1, x < small - 1 ? c + 1 : -1, c - small, c + small]
            .filter((n) => n >= 0 && n < small * small && ready[n]);
          if (!near.length) {
            missing += 1;
            continue;
          }
          for (let k = 0; k < 3; k += 1) colour[c * 3 + k] = near.reduce((sum, n) => sum + colour[n * 3 + k], 0) / near.length;
          filled[c] = 1;
        }
        if (!missing) break;
      }
      const grid = document.createElement("canvas");
      grid.width = small;
      grid.height = small;
      const gridCtx = context(grid, { willReadFrequently: true });
      const pixels = gridCtx.createImageData(small, small);
      // Fill cells with no backdrop from their neighbours.
      for (let pass = 0; pass < 12; pass += 1) {
        for (let c = 0; c < small * small; c += 1) {
          if (sums[c * 4 + 3] > 0) continue;
          const x = c % small;
          const near = [c - 1, c + 1, c - small, c + small].filter((n) => n >= 0 && n < small * small
            && Math.abs((n % small) - x) <= 1 && sums[n * 4 + 3] > 0);
          if (!near.length) continue;
          for (const n of near) for (let k = 0; k < 3; k += 1) sums[c * 4 + k] += sums[n * 4 + k] / sums[n * 4 + 3] / near.length;
          sums[c * 4 + 3] = pass === 11 ? 1 : 1e-6 + 1;
        }
      }
      for (let c = 0; c < small * small; c += 1) {
        pixels.data[c * 4] = colour[c * 3];
        pixels.data[c * 4 + 1] = colour[c * 3 + 1];
        pixels.data[c * 4 + 2] = colour[c * 3 + 2];
        pixels.data[c * 4 + 3] = 255;
      }
      gridCtx.putImageData(pixels, 0, 0);
      const full = document.createElement("canvas");
      full.width = work;
      full.height = work;
      const fullCtx = context(full, { willReadFrequently: true });
      fullCtx.filter = "blur(10px)";
      fullCtx.drawImage(grid, 0, 0, work, work);
      return fullCtx.getImageData(0, 0, work, work).data;
    };
    const differs = (backdrop, threshold) => {
      const mask = new Uint8Array(total);
      for (let p = 0; p < total; p += 1) {
        const i = p * 4;
        const diff = Math.max(Math.abs(data[i] - backdrop[i]), Math.abs(data[i + 1] - backdrop[i + 1]), Math.abs(data[i + 2] - backdrop[i + 2]));
        mask[p] = diff > threshold ? 1 : 0;
      }
      return mask;
    };
    let mask = differs(blurred(null), 30);
    const grow = (source, steps, value) => {
      let current = source;
      for (let step = 0; step < steps; step += 1) {
        const next = current.slice();
        for (let p = 0; p < total; p += 1) {
          if (current[p] === value) continue;
          const x = p % work;
          if ((x > 0 && current[p - 1] === value) || (x < work - 1 && current[p + 1] === value)
            || (p >= work && current[p - work] === value) || (p < total - work && current[p + work] === value)) next[p] = value;
        }
        current = next;
      }
      return current;
    };
    const keepOut = grow(mask, 12, 1);
    const weights = new Uint8Array(total);
    for (let p = 0; p < total; p += 1) weights[p] = keepOut[p] ? 0 : 1;
    mask = differs(blurred(weights), 16);

    // A glossy floor: a row where the brightness steps sharply across most
    // of the width. Everything that starts below it is a reflection.
    let horizon = work;
    let bestStep = 0;
    for (let y = Math.round(work * 0.4); y < work * 0.92; y += 1) {
      let step = 0;
      for (let x = 0; x < work; x += 4) step += Math.abs(lum[(y + 2) * work + x] - lum[(y - 2) * work + x]);
      step /= work / 4;
      if (step > bestStep) {
        bestStep = step;
        horizon = y;
      }
    }
    if (bestStep < 4) horizon = work;
    // The floor edge itself is a thin line across the photo; drop mask
    // pixels near it that have no product above and below.
    if (horizon < work) {
      const reach = 12 * work;
      for (let y = Math.max(0, horizon - 10); y <= Math.min(work - 1, horizon + 10); y += 1) {
        for (let x = 0; x < work; x += 1) {
          const p = y * work + x;
          if (mask[p] && !(p - reach >= 0 && mask[p - reach]) && !(p + reach < total && mask[p + reach])) mask[p] = 0;
        }
      }
    }

    // Close small gaps in the outline, then fill what it encloses.
    const detected = mask;
    mask = grow(grow(mask, 16, 1), 16, 0);
    const outside = new Uint8Array(total);
    const queue = [];
    for (let x = 0; x < work; x += 1) queue.push(x, total - work + x);
    for (let y = 0; y < work; y += 1) queue.push(y * work, y * work + work - 1);
    for (const p of queue) if (!mask[p]) outside[p] = 1;
    for (let k = 0; k < queue.length; k += 1) {
      const p = queue[k];
      if (!outside[p]) continue;
      for (const n of neighbours(p, work, total)) {
        if (!outside[n] && !mask[n]) {
          outside[n] = 1;
          queue.push(n);
        }
      }
    }
    // Small enclosed pockets that show the backdrop (inside a key ring,
    // between parts) are background; large ones are dark parts of the
    // product and stay.
    const pocket = new Int32Array(total);
    let pocketId = 0;
    for (let start = 0; start < total; start += 1) {
      if (outside[start] || mask[start] || pocket[start]) continue;
      pocketId += 1;
      const members = [start];
      pocket[start] = pocketId;
      for (let k = 0; k < members.length; k += 1) {
        for (const n of neighbours(members[k], work, total)) {
          if (!outside[n] && !mask[n] && !pocket[n]) {
            pocket[n] = pocketId;
            members.push(n);
          }
        }
      }
      if (members.length < total * 0.03) for (const p of members) outside[p] = 1;
    }
    // Smooth the filled outline, but keep fine detail that was clearly
    // detected (a key ring, a chain).
    smoothMask(outside, work, 7);
    for (let p = 0; p < total; p += 1) if (detected[p] && !pocket[p]) outside[p] = 0;
    const state = { width: work, height: work, data, background: outside };
    keepMainProduct(state, { below: horizon + 3 });
    let kept = 0;
    for (let p = 0; p < total; p += 1) if (!outside[p]) kept += 1;
    if (kept < total * 0.01 || kept > total * 0.6) return null;
    if (looksLikeLeftoverLight(state)) return null;
    const product = productCanvas(state);
    if (!product || product.canvas.width < work * 0.05 || product.canvas.height < work * 0.05) return null;
    return product;
  }

  // Rounds off a jagged mask edge: blur it and cut at the halfway level.
  function smoothMask(background, width, radius) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = background.length / width;
    const maskCtx = context(canvas, { willReadFrequently: true });
    const pixels = maskCtx.createImageData(canvas.width, canvas.height);
    for (let p = 0; p < background.length; p += 1) {
      pixels.data[p * 4 + 3] = 255;
      pixels.data[p * 4] = background[p] ? 0 : 255;
    }
    maskCtx.putImageData(pixels, 0, 0);
    const blurred = document.createElement("canvas");
    blurred.width = canvas.width;
    blurred.height = canvas.height;
    const blurCtx = context(blurred, { willReadFrequently: true });
    blurCtx.fillStyle = "#000";
    blurCtx.fillRect(0, 0, blurred.width, blurred.height);
    blurCtx.filter = `blur(${radius}px)`;
    blurCtx.drawImage(canvas, 0, 0);
    const out = blurCtx.getImageData(0, 0, blurred.width, blurred.height).data;
    for (let p = 0; p < background.length; p += 1) background[p] = out[p * 4] < 128 ? 1 : 0;
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

  const noAdjustments = { rotation: 0, zoom: 1, offsetX: 0, offsetY: 0, brightness: 1, contrast: 1, background: 0 };

  // How strong a red glow to put behind a product (0 to 1): dark and black
  // products would blend into the dark studio background, so the background
  // gets a soft red glow behind them; the product itself is left exactly as
  // it is.
  function backgroundFor(product) {
    const { canvas } = product;
    const { data } = context(canvas, { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
    let solid = 0;
    let dark = 0;
    for (let i = 0; i < data.length; i += 16) {
      if (data[i + 3] < 200) continue;
      solid += 1;
      if (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114 < 70) dark += 1;
    }
    if (!solid) return 0;
    const share = dark / solid;
    return Math.round(Math.min(0.9, Math.max(0, (share - 0.15) * 2)) * 100) / 100;
  }

  // The admin's manual adjustments act on the cut-out product only: turning
  // it and changing its brightness and contrast here, its size and position
  // when it is placed. The studio background is never changed, so every
  // photo keeps the same background.
  function adjustProduct(product, adjust) {
    const turn = (((adjust.rotation || 0) % 360) + 360) % 360;
    const source = product.canvas;
    if (!turn && adjust.brightness === 1 && adjust.contrast === 1) {
      return { ...product, turn: 0, sourceWidth: source.width, sourceHeight: source.height };
    }
    const sideways = turn === 90 || turn === 270;
    const canvas = document.createElement("canvas");
    canvas.width = sideways ? source.height : source.width;
    canvas.height = sideways ? source.width : source.height;
    const ctx = context(canvas);
    ctx.filter = `brightness(${adjust.brightness}) contrast(${adjust.contrast})`;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((turn * Math.PI) / 180);
    ctx.drawImage(source, -source.width / 2, -source.height / 2);
    return { canvas, minX: product.minX, minY: product.minY, turn, sourceWidth: source.width, sourceHeight: source.height };
  }

  // Gives a cut-out photo its adjustments: photo.adjustments, setAdjustments
  // (re-renders both variants), drawPreview (draws one variant with trial
  // adjustments, for the adjust dialog) and toProduct (maps a point on the
  // finished photo back to the cut-out, for tap-to-remove).
  function makeAdjustable(photo, getProduct, compose, { autoBackground = true } = {}) {
    let last = null;
    const draw = (ctx, variant, adjust) => {
      const adjusted = adjustProduct(getProduct(), adjust);
      const placement = compose(ctx, adjusted, {
        accent: variant === "accent",
        zoom: adjust.zoom,
        offsetX: adjust.offsetX,
        offsetY: adjust.offsetY,
        background: adjust.background
      });
      return { adjusted, placement };
    };
    photo.adjustable = true;
    photo.autoBackground = autoBackground ? backgroundFor(getProduct()) : 0;
    photo.adjustments = { ...noAdjustments, background: photo.autoBackground };
    photo.renderVariants = () => {
      for (const variant of ["standard"]) {
        const fresh = newCanvas();
        last = draw(context(fresh), variant, photo.adjustments);
        photo.variants[variant] = fresh.toDataURL("image/jpeg", quality);
      }
      return last.placement;
    };
    let preview = null;
    photo.drawPreview = (ctx, adjust) => {
      preview = draw(ctx, photo.choice, { ...photo.adjustments, ...adjust });
    };
    photo.setAdjustments = (adjust) => {
      photo.adjustments = { ...photo.adjustments, ...adjust };
      photo.renderVariants();
    };
    // fromPreview maps through the adjust dialog's latest preview, which
    // may use adjustments not saved yet. Also returns the scale, so a brush
    // size on the photo can be turned into cut-out pixels.
    photo.toProduct = (u, v, { fromPreview = false } = {}) => {
      const { adjusted, placement } = fromPreview && preview ? preview : last;
      const ax = (u * size - placement.x) / placement.scale - adjusted.canvas.width / 2;
      const ay = (v * size - placement.y) / placement.scale - adjusted.canvas.height / 2;
      const angle = (-adjusted.turn * Math.PI) / 180;
      const sx = ax * Math.cos(angle) - ay * Math.sin(angle) + adjusted.sourceWidth / 2;
      const sy = ax * Math.sin(angle) + ay * Math.cos(angle) + adjusted.sourceHeight / 2;
      return { x: Math.floor(sx + adjusted.minX), y: Math.floor(sy + adjusted.minY), scale: placement.scale };
    };
  }

  // Returns { dataUrl, mode, canEdit, removeAt(u, v), reset() }. removeAt takes a
  // point on the finished photo (0 to 1 across and down) and removes the
  // leftover background around it; dataUrl always holds the latest result.
  // Cut-out photos also get variants { standard, accent } and a choice, which
  // starts on accent for dark products; dataUrl follows the choice.
  async function createStudioPhoto(file, { studio = true, stand = true } = {}) {
    const img = await loadImage(file);
    if (!stand) await loadBackdrop();
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
    const standless = !stand && hasDarkBackdrop(img)
      ? extractFromStandPhoto(img) || (!matchesAccessoryBackdrop(img) && (await aiProduct(img) || extractFromDarkPhoto(img)))
      : null;
    if (standless) {
      photo.mode = "unstand";
      photo.variants = {};
      photo.choice = "standard";
      makeAdjustable(photo, () => standless, composeFloating);
      photo.renderVariants();
      delete photo.dataUrl;
      Object.defineProperty(photo, "dataUrl", {
        get: () => photo.variants[photo.choice],
        enumerable: true
      });
      return photo;
    }

    // Photos already on a dark studio background, and photos the product
    // cannot be separated from, are kept exactly as they are, but as a full
    // photo layer over the studio background, so they get the same tools:
    // erase (showing the studio background underneath), restore, rotate,
    // zoom and move.
    let fullFrame = false;
    let initial = null;
    if (hasDarkBackdrop(img)) {
      photo.mode = "restyle";
      fullFrame = true;
      initial = fullFrameState(img);
    } else {
      initial = (await aiCutOut(img)) || prepareCutOut(img);
    }
    let product = initial && productCanvas(initial);
    if (!product) {
      photo.mode = "studio-photo";
      fullFrame = true;
      initial = fullFrameState(img);
      product = productCanvas(initial);
    }

    const state = initial;
    const firstMask = state.background.slice();
    const firstAlpha = Uint8ClampedArray.from({ length: state.width * state.height }, (_, p) => state.data[p * 4 + 3]);
    let placement;
    if (!fullFrame) photo.mode = "studio";
    photo.fullFrame = fullFrame;
    photo.canEdit = true;
    photo.variants = {};
    delete photo.dataUrl;
    Object.defineProperty(photo, "dataUrl", {
      get: () => photo.variants[photo.choice],
      enumerable: true
    });

    const bounds = { minX: product.minX, minY: product.minY, width: product.canvas.width, height: product.canvas.height };
    let current = product;
    photo.choice = "standard";
    makeAdjustable(
      photo,
      () => current,
      (ctx, item, options) => (fullFrame
        ? composeFullFrame(ctx, item, { ...options, underlay: initial.underlay })
        : composeCutOut(ctx, item, { ...options, stand })),
      { autoBackground: !fullFrame }
    );
    placement = photo.renderVariants();
    photo.choice = "standard";

    const render = () => {
      const next = productCanvas(state, bounds);
      if (!next) return false;
      current = next;
      photo.renderVariants();
      return true;
    };

    // Erase and restore brush for the adjust dialog. (u, v) is a point on
    // the preview (0 to 1), radius a fraction of the photo's width. Erase
    // removes the cut-out there; restore brings back the original photo
    // there, exactly as it was taken. Changes apply to the preview at once
    // and are kept only by commitBrush; cancelBrush undoes them.
    let snapshot = null;
    photo.canBrush = true;
    photo.beginBrush = () => {
      snapshot = { background: state.background.slice(), alpha: Uint8ClampedArray.from({ length: state.width * state.height }, (_, p) => state.data[p * 4 + 3]) };
    };
    photo.brush = (u, v, radius, mode) => {
      const centre = photo.toProduct(u, v, { fromPreview: true });
      const reach = (radius * size) / centre.scale;
      const { width, height, data, background, source } = state;
      for (let y = Math.max(0, Math.floor(centre.y - reach)); y <= Math.min(height - 1, centre.y + reach); y += 1) {
        for (let x = Math.max(0, Math.floor(centre.x - reach)); x <= Math.min(width - 1, centre.x + reach); x += 1) {
          const d = Math.hypot(x - centre.x, y - centre.y);
          if (d > reach) continue;
          const p = y * width + x;
          const i = p * 4;
          // A soft brush edge (the outer quarter fades), so strokes blend in.
          const strength = Math.min(1, (reach - d + 0.5) / Math.max(1, reach * 0.25));
          if (mode === "erase") {
            data[i + 3] = Math.round(data[i + 3] * (1 - strength));
            if (data[i + 3] < 10) background[p] = 1;
          } else {
            data[i] = source[i];
            data[i + 1] = source[i + 1];
            data[i + 2] = source[i + 2];
            data[i + 3] = Math.max(background[p] ? 0 : data[i + 3], Math.round(255 * strength));
            background[p] = 0;
          }
        }
      }
      const next = productCanvas(state, bounds);
      if (next) current = next;
    };
    photo.cancelBrush = () => {
      if (!snapshot) return;
      state.background = snapshot.background;
      for (let p = 0; p < snapshot.alpha.length; p += 1) state.data[p * 4 + 3] = snapshot.alpha[p];
      snapshot = null;
      current = productCanvas(state, bounds) || current;
    };
    photo.commitBrush = () => {
      snapshot = null;
    };

    photo.removeAt = (u, v) => {
      const { x: px, y: py } = photo.toProduct(u, v);
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
      for (let p = 0; p < firstAlpha.length; p += 1) state.data[p * 4 + 3] = firstAlpha[p];
      render();
    };

    return photo;
  }

  window.zenzoStudio = { createStudioPhoto, size };
})();
