// Accept a state snapshot without silently accepting a newer revision.
export function requestContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(k => !['sessionId','documentId','documentInstanceId','revision','expectedRevision'].includes(k))) {
    throw Object.assign(new Error('Expected a document context'), {code:'PARAM_SCHEMA_INVALID',path:'context'});
  }
  const {revision, expectedRevision, ...identity} = value;
  if (revision !== undefined && expectedRevision !== undefined && revision !== expectedRevision) {
    throw Object.assign(new Error('revision and expectedRevision disagree'), {code:'REVISION_CONFLICT',path:'context.expectedRevision'});
  }
  const expected = expectedRevision ?? revision;
  if (!Number.isSafeInteger(expected) || expected < 0) throw Object.assign(new Error('A nonnegative revision is required'), {code:'PARAM_SCHEMA_INVALID',path:'context.expectedRevision'});
  return {...identity,expectedRevision:expected};
}
export const normalizeRequest = input => input?.context ? {...input,context:requestContext(input.context)} : input;
