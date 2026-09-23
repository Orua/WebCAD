// Run in an authorized WebCAD page-script context after the kernel is ready.
// This example calls only the public page API; it does not click UI elements.
export async function buildPlateWithNamedParameters(api = window.webcad.api) {
  const state = () => {
    const result = api.getState();
    if (result.status !== 'read' || !result.summary?.kernelReady) throw new Error('WebCAD is not ready');
    return result;
  };
  const context = () => {
    const { revision, ...identity } = state().context;
    return { ...identity, expectedRevision: revision };
  };
  const committed = result => {
    if (result.status !== 'committed') {
      throw new Error(`Command was not committed: ${result.error?.code || result.status}`);
    }
    return result;
  };
  const execute = (action, args) => api.execute({
    context: context(), idempotencyKey: crypto.randomUUID(), action, args,
  }).then(committed);
  const add = (card, params, refs) => execute('feature.add', {
    op: card.id, opVersion: card.version, schemaHash: card.schemaHash, params, refs,
  });

  // Page API refuses a dirty replacement. Save the current project before running.
  await api.files.new({ context: context() });
  const plateTool = api.getTool({ id: 'box' });
  const holesTool = api.getTool({ id: 'multiHole' });
  const plate = await add(plateTool, { width: 50, depth: 30, height: 3 }, []);
  const plateFeatureId = plate.createdFeatureIds?.[0];
  const plateBodyId = plate.createdBodyIds?.[0];
  if (!plateFeatureId || !plateBodyId) throw new Error('Plate IDs missing from committed result');

  const holes = await add(holesTool, {
    radius: 2, depth: 5, axis: 'Z', direction: -1,
    points: [[5, 5, 4], [45, 5, 4], [5, 25, 4], [45, 25, 4]],
  }, [plateBodyId]);
  const holesFeatureId = holes.createdFeatureIds?.[0];
  const holesBodyId = holes.createdBodyIds?.[0];
  if (!holesFeatureId || !holesBodyId) throw new Error('Hole IDs missing from committed result');

  await execute('document.parameters', {
    parameters: {
      length: { value: 50, unit: 'mm' },
      width: { value: 30, unit: 'mm' },
      thickness: { value: 3, unit: 'mm' },
      holeRadius: { value: 2, unit: 'mm' },
      edgeMargin: { value: 5, unit: 'mm' },
    },
    bindings: {
      [plateFeatureId]: { width: 'length', depth: 'width', height: 'thickness' },
      [holesFeatureId]: {
        radius: 'holeRadius',
        'points.1.0': 'length-edgeMargin',
        'points.3.0': 'length-edgeMargin',
      },
    },
  });
  const before = state();
  if (before.parameterValues.length?.value !== 50) throw new Error('Initial parameter evaluation failed');

  // One change recalculates the plate and both right holes in a single undo step.
  await execute('document.parameters', { parameters: { length: { value: 63, unit: 'mm' } } });
  const after = state();
  if (after.parameterValues.length?.value !== 63) throw new Error('Length update failed');
  const finalBodyId = after.bodies.find(body => body.id === holesBodyId)?.id;
  if (!finalBodyId) throw new Error('Final body missing from current state');
  const measurement = await api.measure({ context: context(), bodyId: finalBodyId, kind: 'body' });
  if (measurement.status !== 'read') throw new Error(`Measurement failed: ${measurement.error?.code}`);

  const saved = await api.files.save({ context: context(), name: 'named-four-hole-plate.webcad' });
  const projectBlob = await api.files.read({ resourceId: saved.resourceId, as: 'blob' });
  // saved.status is "generated". The caller must choose download or an authorized
  // File System Access handle before claiming a disk save.
  return { plateFeatureId, holesFeatureId, finalBodyId, measurement,
    parameters: after.parameters, parameterValues: after.parameterValues,
    projectResource: saved, projectBlob };
}
