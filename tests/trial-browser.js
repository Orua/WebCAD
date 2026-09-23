async (page) => {
  const context = await page.context().browser().newContext();
  try {
    page = await context.newPage();
    const network = [], sockets = [];
    page.on('request', (request) => network.push({ method: request.method(), url: request.url() }));
    page.on('websocket', (socket) => sockets.push(socket.url()));
    await page.goto('http://localhost:1443/webcad-trial/');
    await page.waitForFunction(() => window.webcad?.api.getState().summary?.kernelReady);
    await page.reload();
    await page.waitForFunction(() => window.webcad?.api.getState().summary?.kernelReady);

    const uiSample = async (name) => {
      const previousInstance = await page.evaluate(() => window.webcad.api.getState().context.documentInstanceId);
      await page.locator('[data-action="trialSamples"]').click();
      const button = page.locator(`[data-trial-sample="${name}"]`);
      await button.waitFor({ state: 'visible' });
      await button.click();
      await page.waitForFunction((oldInstance) => {
        const state = window.webcad.api.getState();
        return state.context.documentInstanceId !== oldInstance && !state.summary.busy;
      }, previousInstance);
    };
    const uiParameter = async (name, value) => {
      await page.getByRole('button', { name: '参数表', exact: true }).click();
      await page.locator(`[data-parameter-form] input[name="${name}"]`).fill(String(value));
      await page.getByRole('dialog').getByRole('button', { name: '应用参数', exact: true }).click();
      await page.waitForFunction((entry) => {
        const state = window.webcad.api.getState();
        return state.parameterValues?.[entry.name]?.value === entry.value && !state.summary.busy;
      }, { name, value });
    };
    const inspect = () => page.evaluate(async () => {
      const api = window.webcad.api;
      const state = api.getState();
      const { revision, ...rest } = state.context;
      const bodyId = state.bodies.at(-1)?.id;
      if (!bodyId) throw new Error('样件没有可测实体');
      const measure = await api.measure({ context: { ...rest, expectedRevision: revision }, bodyId });
      if (measure.status !== 'read' || measure.solidCount !== 1) throw new Error(`测量失败: ${JSON.stringify(measure)}`);
      return { state, measure };
    });
    const capture = () => page.evaluate(async () => {
      const api = window.webcad.api;
      const { revision, ...rest } = api.getState().context;
      const result = await api.capture({ context: { ...rest, expectedRevision: revision } });
      if (!result.dataUrl?.startsWith('data:image/')) throw new Error('截图 API 未返回 dataUrl');
      return result.dataUrl;
    });
    const saveToOpfs = (fileName, includeBase64 = false) => page.evaluate(async ({ name, includeBase64: includeBytes }) => {
      const api = window.webcad.api;
      const { revision, ...rest } = api.getState().context;
      const resource = await api.files.save({ context: { ...rest, expectedRevision: revision } });
      const bytes = await api.files.read({ resourceId: resource.resourceId, as: 'bytes' });
      const directory = await navigator.storage.getDirectory();
      const handle = await directory.getFileHandle(name, { create: true });
      const write = await api.files.write({ resourceId: resource.resourceId, handle });
      const persisted = new Uint8Array(await (await handle.getFile()).arrayBuffer());
      if (persisted.length !== bytes.length || persisted.some((value, index) => value !== bytes[index])) throw new Error('OPFS 回读字节与 files.save 不一致');
      let raw = '';
      if (includeBytes) for (const value of bytes) raw += String.fromCharCode(value);
      return { name, ...(includeBytes ? { base64: btoa(raw) } : {}), size: bytes.length, sha256: resource.sha256, opfsBytes: persisted.length, write };
    }, { name: fileName, includeBase64 });
    const rightHoleX = () => page.evaluate(async () => {
      const api = window.webcad.api;
      const state = api.getState();
      const { revision, ...rest } = state.context;
      const query = await api.queryGeometry({ context: { ...rest, expectedRevision: revision }, bodyId: state.bodies.at(-1).id, kind: 'edge', filter: { curveType: 'circle', radiusRangeMm: { min: 1.99, max: 2.01 } }, requireUnique: false, limit: 100 });
      const centers = new Map(query.items.map((edge) => [edge.center.slice(0, 2).map((n) => n.toFixed(5)).join(','), edge.center]));
      if (centers.size !== 4) throw new Error(`四孔板实际孔中心数错误: ${centers.size}`);
      return Math.max(...[...centers.values()].map((center) => center[0]));
    });
    const exactPlateMeasure = async (length, volume, rightX) => {
      const { state, measure } = await inspect();
      if (state.parameterValues?.length?.value !== length) throw new Error(`length 参数不是 ${length}`);
      if (volume !== null && Math.abs(measure.volume - volume) >= 0.01) throw new Error(`体积错误: ${measure.volume} != ${volume}`);
      if (Math.abs((measure.bounds.max[0] - measure.bounds.min[0]) - length) >= 0.01) throw new Error(`X 尺寸错误: ${JSON.stringify(measure.bounds)}`);
      const holeX = await rightHoleX();
      if (Math.abs(holeX - rightX) >= 0.01) throw new Error(`右孔 X 错误: ${holeX} != ${rightX}`);
      return { state, measure, rightHoleX: holeX };
    };

    await uiSample('plate');
    const initial = await inspect();
    if (initial.state.parameterValues?.length?.value !== 50) throw new Error('四孔板初始 length 不是 50');
    await uiParameter('length', 57);
    const plate57 = await exactPlateMeasure(57, 4979.203552627690, 52);

    await page.getByRole('button', { name: '↶ 撤销', exact: true }).click();
    await page.waitForFunction(() => window.webcad.api.getState().parameterValues.length?.value === 50 && !window.webcad.api.getState().summary.busy);
    const plateUndo = await exactPlateMeasure(50, null, 45);
    await page.getByRole('button', { name: '↷ 重做', exact: true }).click();
    await page.waitForFunction(() => window.webcad.api.getState().parameterValues.length?.value === 57 && !window.webcad.api.getState().summary.busy);
    const plateRedo = await exactPlateMeasure(57, 4979.203552627690, 52);

    const views = await page.evaluate(async () => {
      const api = window.webcad.api;
      const screenshots = [];
      const records = [];
      for (const direction of ['top', 'side', 'iso']) {
        const before = api.getState().context.revision;
        const { revision, ...rest } = api.getState().context;
        const view = await api.setView({ context: { ...rest, expectedRevision: revision }, direction, fit: true });
        const after = api.getState().context.revision;
        if (after !== before) throw new Error(`${direction} 视图改变了模型 revision`);
        const { revision: currentRevision, ...current } = api.getState().context;
        const capture = await api.capture({ context: { ...current, expectedRevision: currentRevision } });
        screenshots.push({ name: `plate-57-${direction}.png`, dataUrl: capture.dataUrl });
        records.push({ direction, view, revision: before, afterRevision: after });
      }
      return { records, screenshots };
    });

    const native57 = await page.evaluate(async () => {
      const api = window.webcad.api;
      const { revision, ...rest } = api.getState().context;
      const resource = await api.files.save({ context: { ...rest, expectedRevision: revision } });
      const bytes = await api.files.read({ resourceId: resource.resourceId, as: 'bytes' });
      const directory = await navigator.storage.getDirectory();
      const handle = await directory.getFileHandle('trial-plate-57.webcad', { create: true });
      await api.files.write({ resourceId: resource.resourceId, handle });
      const persisted = new Uint8Array(await (await handle.getFile()).arrayBuffer());
      if (persisted.length !== bytes.length || persisted.some((value, index) => value !== bytes[index])) throw new Error('OPFS 写入回读不一致');
      const registered = await api.files.register({ name: 'trial-plate-57.webcad', data: persisted });
      const oldInstance = api.getState().context.documentInstanceId;
      const { revision: currentRevision, ...current } = api.getState().context;
      await api.files.open({ context: { ...current, expectedRevision: currentRevision }, resourceId: registered.resourceId });
      if (api.getState().context.documentInstanceId === oldInstance) throw new Error('原生工程重开未建立新实例');
      let raw = '';
      for (const value of bytes) raw += String.fromCharCode(value);
      return { name: 'trial-plate-57.webcad', base64: btoa(raw), size: bytes.length, sha256: resource.sha256, opfsBytes: persisted.length, reopened: api.getState() };
    });
    const reopened57 = await exactPlateMeasure(57, 4979.203552627690, 52);

    await uiParameter('length', 61);
    const plate61 = await exactPlateMeasure(61, 5339.203552627690, 56);
    const native61 = await saveToOpfs('trial-plate-61.webcad', true);
    const stepResult = await page.evaluate(async () => {
      const api = window.webcad.api;
      const { revision, ...rest } = api.getState().context;
      const context = { ...rest, expectedRevision: revision };
      const step = await api.files.export({ context, format: 'step' });
      const bytes = await api.files.read({ resourceId: step.resourceId, as: 'bytes' });
      if (!bytes.length) throw new Error('STEP 导出为空');
      const registered = await api.files.register({ name: 'trial-plate-61.step', data: bytes });
      await api.files.new({ context });
      const { revision: freshRevision, ...fresh } = api.getState().context;
      await api.files.import({ context: { ...fresh, expectedRevision: freshRevision }, resourceId: registered.resourceId });
      const state = api.getState();
      const { revision: importedRevision, ...importedContext } = state.context;
      const measure = await api.measure({ context: { ...importedContext, expectedRevision: importedRevision }, bodyId: state.bodies.at(-1).id });
      if (measure.status !== 'read' || measure.solidCount !== 1 || Math.abs(measure.volume - 5339.203552627690) >= 0.01 || Math.abs((measure.bounds.max[0] - measure.bounds.min[0]) - 61) >= 0.01) {
        throw new Error(`STEP roundtrip mismatch: ${JSON.stringify(measure)}`);
      }
      let raw = '';
      for (const value of bytes) raw += String.fromCharCode(value);
      return { file: { name: 'trial-plate-61.step', base64: btoa(raw), size: bytes.length, sha256: step.sha256 }, state, measure };
    });
    const plate = { initial, after57: plate57, undo: plateUndo, redo: plateRedo, views, native57, reopened57, after61: plate61, native61, stepRoundtrip: stepResult };

    const samples = [];
    for (const item of [
      { sample: 'frame', field: 'innerWidth', value: 31 },
      { sample: 'nameplate', field: 'thickness', value: 3.5 },
      { sample: 'bushing', field: 'bodyDiameter', value: 14 },
      { sample: 'tray', field: 'outerWidth', value: 66 },
    ]) {
      const clean = await saveToOpfs(`trial-clean-before-${item.sample}.webcad`);
      await uiSample(item.sample);
      const before = await inspect();
      await uiParameter(item.field, item.value);
      const after = await inspect();
      if (after.state.parameterValues?.[item.field]?.value !== item.value) throw new Error(`${item.sample}.${item.field} 未按 UI 参数更新`);
      if (Math.abs(after.measure.volume - before.measure.volume) < 0.01) throw new Error(`${item.sample} 实际几何未随参数改变`);
      samples.push({ family: item.sample, field: item.field, value: item.value, cleanWrite: clean, before, after, dataUrl: await capture() });
    }

    await saveToOpfs('trial-clean-before-dirty-switch.webcad');
    await uiSample('plate');
    await uiParameter('length', 63);
    const dirtyBefore = await page.evaluate(() => window.webcad.api.getState());
    await page.locator('[data-action="trialSamples"]').click();
    await page.locator('[data-trial-sample="frame"]').click();
    await page.locator('.notification.error').waitFor({ state: 'visible' });
    const dirtyAfter = await page.evaluate(() => window.webcad.api.getState());
    if (!dirtyAfter.summary.dirty || dirtyAfter.context.documentInstanceId !== dirtyBefore.context.documentInstanceId || dirtyAfter.context.revision !== dirtyBefore.context.revision || dirtyAfter.parameterValues.length?.value !== 63) {
      throw new Error('脏工程切换被拒绝后，当前工程状态发生变化');
    }
    const errorText = await page.locator('.notification.error').innerText();
    await page.locator('.notification.error button', { hasText: '关闭' }).click();
    const info = await page.evaluate(() => window.webcad.api.info());
    if (sockets.length || network.some((request) => request.method !== 'GET')) throw new Error(`unexpected non-GET or WebSocket traffic: ${JSON.stringify({ network, sockets })}`);
    return { info, network, sockets, plate, samples, dirtySwitch: { before: dirtyBefore, after: dirtyAfter, errorText } };
  } finally {
    await context.close();
  }
}
