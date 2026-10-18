import type { WebGLRenderer } from "three";
/** Software WebGL needs a bounded pixel/shadow budget so tracking keeps receiving frames. */
export function configureRoomRenderer(renderer: WebGLRenderer): boolean {
  const context = renderer.getContext();
  const info = context.getExtension("WEBGL_debug_renderer_info");
  const name = info
    ? String(context.getParameter(info.UNMASKED_RENDERER_WEBGL))
    : "";
  const software = /swiftshader|llvmpipe|software|basic render/i.test(name);
  if (software) {
    renderer.shadowMap.enabled = false;
    renderer.setPixelRatio(1);
  }
  return software;
}
