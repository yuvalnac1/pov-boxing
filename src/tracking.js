import { bodyFromPose } from './lean.js';
// Webcam + MediaPipe Hand Landmarker.
// Produces, per video frame, the player's LEFT and RIGHT hand in *mirrored* screen space
// (x = 0 is the left of the screen as the player sees it, like a mirror).

const TASKS_VERSION = '0.10.14';
const VISION_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/vision_bundle.mjs`;
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
// Lightweight body model for leaning (shoulders + head). It keeps working when the gloves cover the face.
const POSE_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export class HandTracker {
  constructor(video) {
    this.video = video;
    this.landmarker = null;
    this.lastVideoTime = -1;
    this.prev = { left: null, right: null }; // last known centers, for stable left/right assignment
    this.pose = null;
    this.body = null;     // last body sample (see lean.js)
    this.poseLandmarks = null;
    this.frameNo = 0;
  }

  async init(onStatus = () => {}) {
    onStatus('Starting camera…');
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });
    this.video.srcObject = stream;
    await this.video.play();

    onStatus('Loading hand tracking model…');
    const { FilesetResolver, HandLandmarker, PoseLandmarker } = await import(/* @vite-ignore */ VISION_URL);
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, options('GPU'));
    } catch (err) {
      console.warn('GPU delegate failed, falling back to CPU', err);
      this.landmarker = await HandLandmarker.createFromOptions(fileset, options('CPU'));
    }

    // Body/lean tracking is optional: the game still plays (without leaning) if it fails to load.
    onStatus('Loading body tracking…');
    const poseOptions = (delegate) => ({
      baseOptions: { modelAssetPath: POSE_URL, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try {
      this.pose = await PoseLandmarker.createFromOptions(fileset, poseOptions('GPU'));
    } catch (err) {
      try {
        this.pose = await PoseLandmarker.createFromOptions(fileset, poseOptions('CPU'));
      } catch (err2) {
        console.warn('Body tracking unavailable — leaning disabled', err2);
      }
    }
  }

  // Returns null if there is no new video frame, otherwise { t, left, right } where each hand is
  // null or { landmarks: [{x,y,z}], cx, cy, size }.
  detect() {
    if (!this.landmarker || this.video.readyState < 2) return null;
    if (this.video.currentTime === this.lastVideoTime) return null;
    this.lastVideoTime = this.video.currentTime;

    const t = performance.now();
    const result = this.landmarker.detectForVideo(this.video, t);
    const hands = (result.landmarks || []).map(toHand);
    // Body every other frame (leaning is slow compared to punches), reusing the last sample in between.
    if (this.pose && this.frameNo++ % 2 === 0) {
      try {
        const res = this.pose.detectForVideo(this.video, t + 0.5);
        const lm = res.landmarks?.[0]?.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z, visibility: p.visibility }));
        this.poseLandmarks = lm || null;
        this.body = bodyFromPose(lm);
      } catch (err) {
        console.warn('pose detection failed', err);
        this.pose = null;
      }
    }
    return { t, ...this.assign(hands), body: this.body };
  }

  // Decide which detected hand is the player's left/right. Position-based (more robust than the
  // model's handedness label): in mirrored space the player's left hand is on the left.
  assign(hands) {
    let left = null;
    let right = null;
    if (hands.length >= 2) {
      const [a, b] = hands[0].cx < hands[1].cx ? [hands[0], hands[1]] : [hands[1], hands[0]];
      left = a;
      right = b;
    } else if (hands.length === 1) {
      const h = hands[0];
      const dl = this.prev.left ? dist(h, this.prev.left) : Infinity;
      const dr = this.prev.right ? dist(h, this.prev.right) : Infinity;
      if (dl === Infinity && dr === Infinity) {
        if (h.cx < 0.5) left = h;
        else right = h;
      } else if (dl <= dr) left = h;
      else right = h;
    }
    if (left) this.prev.left = { cx: left.cx, cy: left.cy };
    if (right) this.prev.right = { cx: right.cx, cy: right.cy };
    return { left, right };
  }
}

function toHand(raw) {
  // Mirror x so the data matches what the player sees.
  const landmarks = raw.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z }));
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  // Hand "size" from the palm only (knuckle width / palm length), so opening or closing the fingers
  // doesn't change it — only moving toward the camera does.
  const d = (i, j) => Math.hypot(landmarks[i].x - landmarks[j].x, landmarks[i].y - landmarks[j].y);
  const size = Math.max(d(5, 17) * 2.4, d(0, 9) * 1.6);
  return { landmarks, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, size };
}

function dist(a, b) {
  return Math.hypot(a.cx - b.cx, a.cy - b.cy);
}

// Pairs of landmark indices for drawing the hand skeleton.
export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];
