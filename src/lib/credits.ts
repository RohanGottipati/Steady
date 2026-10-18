/**
 * User-facing attributions for assets and data already in the product.
 * Wording follows docs/ASSET_LICENSES.md and docs/DATA_LICENSES.md.
 */
export interface ProductCredit {
  id: string;
  text: string;
  links?: readonly { label: string; href: string }[];
}

export const PRODUCT_CREDITS: readonly ProductCredit[] = [
  {
    id: "scene",
    text: "The operating room, instruments, needle, pegboard, peg, and targets are procedural geometry written for Steady. They are an educational approximation, not a clinical device. No third-party 3D model is included.",
  },
  {
    id: "mediapipe",
    text: "Hand tracking uses the MediaPipe Hand Landmarker (float16, version 1) and the Tasks Vision runtime under the Apache License 2.0.",
    links: [
      {
        label: "MediaPipe license",
        href: "https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE",
      },
      { label: "Model card", href: "https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20%28Lite_Full%29%20with%20Fairness%20Oct%202021.pdf" },
      { label: "Notices included with this app", href: "/mediapipe/NOTICE" },
    ],
  },
  {
    id: "jigsaws",
    text: "Expert motion data is derived from JIGSAWS for academic, non-commercial use: the optional Needle Passing ghost, and the committed reference demonstrations behind the upcoming Suturing and Knot Tying skills. Yixin Gao, S. Swaroop Vedula, Carol E. Reiley, Narges Ahmidi, Balakrishnan Varadarajan, Henry C. Lin, Lingling Tao, Luca Zappella, Benjamín Béjar, David D. Yuh, Chi Chiung Grace Chen, René Vidal, Sanjeev Khudanpur and Gregory D. Hager. The JHU-ISI Gesture and Skill Assessment Working Set (JIGSAWS): A Surgical Activity Dataset for Human Motion Modeling. In Modeling and Monitoring of Computer Assisted Interventions (M2CAI) – MICCAI Workshop, 2014.",
  },
  {
    id: "lask",
    text: "LASK is not included in this demo. Its license is not confirmed. Peg Transfer uses an internally authored synthetic reference in the LASK adapter format, not expert recordings.",
  },
];
