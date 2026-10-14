(() => {
  const dialog = document.querySelector("#photoAdjuster");
  const canvas = dialog?.querySelector("canvas");
  const stage = dialog?.querySelector("[data-photo-adjuster-stage]");
  const message = dialog?.querySelector("[data-photo-adjuster-message]");
  const saveButton = dialog?.querySelector("[data-photo-adjuster-save]");
  const controls = {
    zoom: dialog?.querySelector('[name="zoom"]'),
    brightness: dialog?.querySelector('[name="brightness"]'),
    contrast: dialog?.querySelector('[name="contrast"]')
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

  function close(result = null) {
    drag = null;
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

  stage.addEventListener("pointerdown", (event) => {
    if (!state.image && !live) return;
    stage.setPointerCapture(event.pointerId);
    drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX: state.offsetX,
      offsetY: state.offsetY
    };
  });

  stage.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const scale = canvas.width / stage.clientWidth;
    state.offsetX = drag.offsetX + (event.clientX - drag.x) * scale;
    state.offsetY = drag.offsetY + (event.clientY - drag.y) * scale;
    draw();
  });

  function endDrag(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag = null;
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  }

  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  window.zenzoPhotoEditor = { open };
})();
