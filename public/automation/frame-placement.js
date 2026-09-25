// Run only in an authorized WebCAD page with an empty or disposable project.
// This creates one 40 x 30 x 6 plate at a non-origin working frame.
export async function createPlateAtWorkingFrame(api = window.webcad.api) {
  const freshContext = () => {
    const { revision, ...identity } = api.getState().context;
    return { ...identity, expectedRevision: revision };
  };
  const execute = async (action, args) => {
    const receipt = await api.execute({
      context: freshContext(), idempotencyKey: crypto.randomUUID(), action, args,
    });
    if (receipt.status !== 'committed') throw new Error(`${action}: ${receipt.error?.code || receipt.status}`);
    return receipt;
  };
  await execute('reference.setWorkFrame', { origin: [100, 50, 0], quaternion: [0, 0, 0, 1] });
  const { frameVersion } = api.getState().referenceSystem.workFrame;
  const tool = api.getTool({ id: 'box' });
  const plate = await execute('feature.add', {
    op: 'box', opVersion: tool.version, schemaHash: tool.schemaHash,
    params: { width: 40, depth: 30, height: 6 }, refs: [],
    placement: { version: 1, frame: { kind: 'work', expectedFrameVersion: frameVersion },
      sourceAnchor: { kind: 'bottom-center' } },
  });
  const bodyId = plate.createdBodyIds?.[0];
  if (!bodyId) throw new Error('Plate body missing');
  const measured = await api.measure({ context: freshContext(), bodyId, kind: 'body' });
  if (measured.status !== 'read') throw new Error(measured.error?.code || measured.status);
  return { plate, measured, workFrame: api.getState().referenceSystem.workFrame };
}
