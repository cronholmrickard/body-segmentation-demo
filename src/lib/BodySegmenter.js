// BodySegmenter.js
import * as bodySegmentation from '@tensorflow-models/body-segmentation';
import '@tensorflow/tfjs-backend-webgl';

const MODEL = bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation;
const SEGMENTER_CONFIG = {
  // using mediapipe runtime here for better performance on some devices.
  runtime: 'mediapipe',
  modelType: 'landscape',
  solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation',
};

export default class BodySegmenter {
  constructor(video, canvas) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.segmenter = null;
    this.running = false;
    this.lastSegmentationTime = 0;
    this.cachedSegmentation = null;
  }

  async loadModel() {
    try {
      this.segmenter = await bodySegmentation.createSegmenter(
        MODEL,
        SEGMENTER_CONFIG,
      );
    } catch (error) {
      console.error('Error loading segmentation model:', error);
      throw error;
    }
  }

  start() {
    if (!this.segmenter) {
      console.error('Segmenter model not loaded');
      return;
    }
    this.running = true;
    this.lastSegmentationTime = 0;
    this._tick();
  }

  stop() {
    this.running = false;
  }

  async _tick() {
    if (!this.running) return;
    const startTime = Date.now();
    const video = this.video;
    const canvas = this.canvas;
    const ctx = this.ctx;

    // Update canvas dimensions to match the video.
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const now = Date.now();
    // Throttle segmentation to ~10 fps.
    if (now - this.lastSegmentationTime >= 100) {
      try {
        this.cachedSegmentation = await this.segmenter.segmentPeople(video, {
          flipHorizontal: false,
          multiSegmentation: false,
        });
      } catch (err) {
        console.error('Segmentation error:', err);
      }
      this.lastSegmentationTime = now;
    }

    // Clear canvas and draw the current video frame.
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // If segmentation data is available, apply the bokeh effect directly.
    if (this.cachedSegmentation && this.cachedSegmentation.length > 0) {
      bodySegmentation.drawBokehEffect(
        canvas, // The canvas on which to draw the effect.
        video, // The source video.
        this.cachedSegmentation, // The segmentation results.
        1.0, // Foreground opacity (keep the person fully visible).
        12, // Blur strength for the background.
        2, // Edge blur amount.
        false, // flipHorizontal flag (adjust as needed).
      );
    }

    // Schedule next frame.
    const elapsed = Date.now() - startTime;
    const delay = Math.max(0, 40 - elapsed);
    setTimeout(() => this._tick(), delay);
  }
}
