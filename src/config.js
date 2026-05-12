const HANDLE_W = 20;         // mm wide (X)
const HANDLE_H = 20;         // mm deep (Y)
const HANDLE_D = 15;         // mm protrusion out the back (Z)

const MIN_FRAME_HEIGHT = 6;  // mm, to ensure the handle is fully enclosed even for very thin plates
const FRAME_CLEARANCE = 0.3;// mm each side → 0.5 mm total per axis
const FRAME_WALL_THICK = 2;  // mm

const MAX_IMAGE_DIM = 1200; // px, for quantization and rendering

export {
  HANDLE_W, HANDLE_H, HANDLE_D,
  MIN_FRAME_HEIGHT, FRAME_CLEARANCE, FRAME_WALL_THICK,
  MAX_IMAGE_DIM
};
