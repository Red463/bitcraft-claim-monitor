export function replaceMapSnapshot({ currentRequestKey, requested }) {
  return requested.requestKey === currentRequestKey ? requested.value : null;
}
