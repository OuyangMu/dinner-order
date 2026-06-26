export function shouldApplyUploadResult(uploadSessionId: number, activeSessionId: number) {
  return uploadSessionId === activeSessionId;
}
