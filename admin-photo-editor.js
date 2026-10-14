(() => {
  const dialog = document.querySelector("#photoAdjuster");
  const canvas = dialog?.querySelector("canvas");
  const stage = dialog?.querySelector("[data-photo-adjuster-stage]");
  const message = dialog?.querySelector("[data-photo-adjuster-message]");
  const saveButton = dialog?.querySelector("[data-photo-adjuster-save]");
  const controls = {
    zoom: dialog?.querySelector('[name="zoom"]'),
    brightness: dialog?.querySelector('[name="brightness"]'),
    contrast: dialog?.querySelector('[name="contrast"]'),
    // How much the studio background is lightened behind the product.
    background: dialog?.querySelector('[name="background"]')
  };
  const outputs = Object.fromEntries(Object.keys(controls).map((name) => [
    name,
    dialog?.querySelector(`[data-photo-value="${name}"]`)
  ]));

  if (!dialog || !canvas || !stage) return;

  const state = {
    image: null,
    zoom: 1,
    brightness: 1,
    contrast: 1,
    background: 0,
    rotation: 0,
    offsetX: 0,
    offsetY: 0
  };
  let drag = null;
  let finish = null;
  // A studio photo with a cut-out product: the controls move, turn, resize
  // and light the product only, and the studio background stays the same.
  // Without one (an original or full photo), the whole photo is adjusted.
  let live = null;
  let frame = 0;
  // Erase / restore brush (studio photos with a cut-out only). tool is
  // "move" (drag repositions), "erase" or "restore".
  const brushPanel = dialog?.querySelector("[data-photo-brush]");
  const brushSize = dialog?.querySelector('[name="brushSize"]');
  const brushValue = dialog?.querySelector("[data-photo-brush-value]");
  const cursor = dialog?.querySelector("[data-photo-cursor]");
  const hint = dialog?.querySelector("[data-photo-hint]");
  const hints = {
    move: "Drag to reposition",
    erase: "Paint over leftover background to erase it",
    restore: "Paint to bring back the original photo"
  };
  let tool = "move";
  let stroke = null;

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onerror = () => reject(new Error("The photo could not be opened."));
      image.onload = () => resolve(image);
      image.src = source;
    });
  }

  function syncControls() {
    for (const [name, control] of Object.entries(controls)) {
      const percent = Math.round(state[name] * 100);
      control.value = percent;
      outputs[name].value = `${percent}%`;
    }
  }

  function restore(adjustments) {
    state.zoom = adjustments.zoom;
    state.brightness = adjustments.brightness;
    state.contrast = adjustments.contrast;
    state.background = adjustments.background;
    state.rotation = adjustments.rotation;
    state.offsetX = adjustments.offsetX * canvas.width;
    state.offsetY = adjustments.offsetY * canvas.height;
    syncControls();
    draw();
  }

  function reset() {
    state.zoom = 1;
    state.brightness = 1;
    state.contrast = 1;
    state.background = live ? live.autoBackground : 0;
    state.rotation = 0;
    state.offsetX = 0;
    state.offsetY = 0;
    syncControls();
    draw();
  }

  function liveAdjustments() {
    return {
      rotation: state.rotation,
      zoom: state.zoom,
      brightness: state.brightness,
      contrast: state.contrast,
      background: state.background,
      offsetX: state.offsetX / canvas.width,
      offsetY: state.offsetY / canvas.height
    };
  }

  function draw() {
    if (live) {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => live.drawPreview(canvas.getContext("2d"), liveAdjustments()));
      return;
    }
    if (!state.image) return;
    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const image = state.image;
    const quarterTurn = Math.abs(state.rotation / 90) % 2 === 1;
    const rotatedWidth = quarterTurn ? image.naturalHeight : image.naturalWidth;
    const rotatedHeight = quarterTurn ? image.naturalWidth : image.naturalHeight;
    const cover = Math.max(width / rotatedWidth, height / rotatedHeight);
    // Keep the photo covering the whole frame, so no empty edge shows.
    const spareX = Math.max(0, (rotatedWidth * cover * state.zoom - width) / 2);
    const spareY = Math.max(0, (rotatedHeight * cover * state.zoom - height) / 2);
    state.offsetX = Math.min(spareX, Math.max(-spareX, state.offsetX));
    state.offsetY = Math.min(spareY, Math.max(-spareY, state.offsetY));

    context.clearRect(0, 0, width, height);
    const background = context.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, "#111a26");
    background.addColorStop(0.55, "#070c14");
    background.addColorStop(1, "#04070c");
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    context.save();
    context.translate(width / 2 + state.offsetX, height / 2 + state.offsetY);
    context.rotate(state.rotation * Math.PI / 180);
    context.scale(cover * state.zoom, cover * state.zoom);
    context.filter = `brightness(${state.brightness}) contrast(${state.contrast})`;
    context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
    context.restore();

    const vignette = context.createRadialGradient(width / 2, height / 2, width * 0.36, width / 2, height / 2, width * 0.72);
    vignette.addColorStop(0, "rgba(3, 7, 13, 0)");
    vignette.addColorStop(1, "rgba(3, 7, 13, 0.22)");
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, height);
  }

  function setTool(name) {
    tool = name;
    for (const button of dialog.querySelectorAll("[data-photo-tool]")) {
      const active = button.dataset.photoTool === name;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    stage.classList.toggle("is-brushing", name !== "move");
    hint.textContent = hints[name];
    if (name === "move") cursor.hidden = true;
  }

  function brushRadius() {
    return Number(brushSize.value) / 100;
  }

  // Paints from the last point to this one, in small steps, so a quick
  // stroke leaves no gaps.
  function paint(event) {
    const box = canvas.getBoundingClientRect();
    const point = { u: (event.clientX - box.left) / box.width, v: (event.clientY - box.top) / box.height };
    const from = stroke.last || point;
    const radius = brushRadius();
    const steps = Math.max(1, Math.ceil(Math.hypot(point.u - from.u, point.v - from.v) / (radius / 3)));
    for (let k = 1; k <= steps; k += 1) {
      live.brush(from.u + ((point.u - from.u) * k) / steps, from.v + ((point.v - from.v) * k) / steps, radius, tool);
    }
    stroke.last = point;
    draw();
  }

  function moveCursor(event) {
    if (tool === "move" || !live?.canBrush) return;
    const box = stage.getBoundingClientRect();
    const canvasBox = canvas.getBoundingClientRect();
    const diameter = brushRadius() * 2 * canvasBox.width;
    cursor.hidden = false;
    cursor.style.width = `${diameter}px`;
    cursor.style.height = `${diameter}px`;
    cursor.style.left = `${event.clientX - box.left}px`;
    cursor.style.top = `${event.clientY - box.top}px`;
  }

  function close(result = null) {
    drag = null;
    stroke = null;
    // Brush changes are kept only when the edited photo is used.
    if (live?.canBrush) {
      if (result) live.commitBrush();
      else live.cancelBrush();
    }
    if (dialog.open) dialog.close();
    const resolve = finish;
    finish = null;
    if (resolve) resolve(result);
  }

  // source is a studio photo object with adjustable set (the product is
  // adjusted on the studio background; resolves with "adjusted" when saved)
  // or an image URL (the whole photo is adjusted; resolves with the edited
  // photo as a data URL). Resolves with null when cancelled.
  async function open(source) {
    if (finish) close(null);
    live = source && source.adjustable ? source : null;
    message.textContent = live ? "" : "Loading photo...";
    saveButton.disabled = !live;
    const studioSize = window.zenzoStudio?.size || 1200;
    canvas.width = live ? studioSize : 1000;
    canvas.height = live ? studioSize : 1000;
    // Zooming a whole photo out would show an empty border around it.
    controls.zoom.min = live ? "40" : "100";
    // Only a studio photo has a separate background to lighten.
    controls.background.closest("[data-photo-background-control]").hidden = !live;
    brushPanel.hidden = !live?.canBrush;
    setTool("move");
    if (live?.canBrush) live.beginBrush();
    dialog.showModal();
    const result = new Promise((resolve) => {
      finish = resolve;
    });
    if (live) {
      state.image = null;
      restore(live.adjustments);
      return result;
    }
    try {
      state.image = await loadImage(source);
      reset();
      message.textContent = "";
      saveButton.disabled = false;
    } catch (error) {
      message.textContent = error.message;
    }
    return result;
  }

  for (const [name, control] of Object.entries(controls)) {
    control.addEventListener("input", () => {
      state[name] = Number(control.value) / 100;
      outputs[name].value = `${control.value}%`;
      draw();
    });
  }

  dialog.addEventListener("click", (event) => {
    const rotation = event.target.closest("[data-photo-rotate]");
    if (rotation) {
      state.rotation = (state.rotation + Number(rotation.dataset.photoRotate)) % 360;
      state.offsetX = 0;
      state.offsetY = 0;
      draw();
      return;
    }
    const toolButton = event.target.closest("[data-photo-tool]");
    if (toolButton) {
      setTool(toolButton.dataset.photoTool);
      return;
    }
    if (event.target.closest("[data-photo-brush-undo]") && live?.canBrush) {
      live.cancelBrush();
      live.beginBrush();
      draw();
      return;
    }
    if (event.target.closest("[data-photo-reset]")) reset();
    if (event.target.closest("[data-photo-adjuster-close], [data-photo-adjuster-cancel]")) close(null);
    if (event.target.closest("[data-photo-adjuster-save]")) {
      if (live) {
        live.setAdjustments(liveAdjustments());
        close("adjusted");
      } else {
        close(canvas.toDataURL("image/jpeg", 0.9));
      }
    }
  });

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close(null);
  });

  brushSize.addEventListener("input", () => {
    brushValue.value = `${brushSize.value}%`;
  });

  stage.addEventListener("pointerdown", (event) => {
    if (!state.image && !live) return;
    stage.setPointerCapture(event.pointerId);
    if (tool !== "move" && live?.canBrush) {
      stroke = { pointerId: event.pointerId, last: null };
      paint(event);
      return;
    }
    drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX: state.offsetX,
      offsetY: state.offsetY
    };
  });

  stage.addEventListener("pointermove", (event) => {
    moveCursor(event);
    if (stroke && stroke.pointerId === event.pointerId) {
      paint(event);
      return;
    }
    if (!drag || drag.pointerId !== event.pointerId) return;
    const scale = canvas.width / stage.clientWidth;
    state.offsetX = drag.offsetX + (event.clientX - drag.x) * scale;
    state.offsetY = drag.offsetY + (event.clientY - drag.y) * scale;
    draw();
  });

  stage.addEventListener("pointerleave", () => {
    cursor.hidden = true;
  });

  function endDrag(event) {
    if (stroke && stroke.pointerId === event.pointerId) {
      stroke = null;
      if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
      return;
    }
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag = null;
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  }

  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  window.zenzoPhotoEditor = { open };
})();
