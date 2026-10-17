/** Network and speech rejections that should become a notice, not a crash. */
export function isRecoverableRejection(reason: unknown): boolean {
  if (!(reason instanceof Error)) return false;
  return /failed to fetch|network|load reference|speech route|speech synthesis|aborted|voice service/i.test(reason.message);
}
