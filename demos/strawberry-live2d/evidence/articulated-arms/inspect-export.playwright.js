async (page) => {
  const context = await page.context().browser().newContext();
  const p = await context.newPage();
  try {
    await p.goto('http://127.0.0.1:5187/');
    await p.waitForFunction(() => window.Live2DCubismCore);
    return await p.evaluate(async () => {
      const C = window.Live2DCubismCore;
      const bytes = await (await fetch('/model-articulated/strawberry-bunny.moc3?t=' + Date.now())).arrayBuffer();
      const moc = C.Moc.fromArrayBuffer(bytes), model = C.Model.fromMoc(moc);
      const parameters = model.parameters, checks = [];
      const snapshot = () => model.drawables.ids.map((id, i) => ({
        id, opacity: model.drawables.opacities[i], positions: Array.from(model.drawables.vertexPositions[i])
      }));
      try {
        for (const id of ['ParamArmL', 'ParamArmR', 'ParamElbowL', 'ParamElbowR', 'ParamWristL', 'ParamWristR']) {
          const index = parameters.ids.indexOf(id);
          if (index < 0) { checks.push({ id, missing: true }); continue; }
          const values = [...new Set([parameters.minimumValues[index], 0, parameters.maximumValues[index]])];
          const samples = [];
          for (const value of values) {
            parameters.values.set(parameters.defaultValues); parameters.values[index] = value; model.update();
            samples.push({ value, drawables: snapshot() });
          }
          checks.push({ id, samples });
        }
        parameters.values.set(parameters.defaultValues); model.update();
        return {
          parameters: parameters.ids, defaults: Array.from(parameters.defaultValues),
          neutral: snapshot(), checks,
          renderOrders: model.drawables.ids.map((id, i) => ({ id, order: model.getRenderOrders()[i] })),
          geometry: {
            canvas: { CanvasWidth: model.canvasinfo.CanvasWidth, CanvasHeight: model.canvasinfo.CanvasHeight },
            drawables: model.drawables.ids.map((id, i) => ({
              id, opacity: model.drawables.opacities[i], positions: Array.from(model.drawables.vertexPositions[i]),
              uvs: Array.from(model.drawables.vertexUvs[i])
            }))
          }
        };
      } finally { model.release(); moc._release(); }
    });
  } finally { await context.close(); }
}
