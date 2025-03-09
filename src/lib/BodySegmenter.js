// BodySegmenter.js
import * as bodySegmentation from '@tensorflow-models/body-segmentation';
import '@tensorflow/tfjs-backend-webgl';

const MODEL = bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation;
const SEGMENTER_CONFIG = {
  runtime: 'mediapipe',
  modelType: 'landscape',
  solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation',
};

export default class BodySegmenter {
  /**
   * @param {HTMLVideoElement} video - The video element.
   * @param {HTMLCanvasElement} maskCanvas - Offscreen canvas for outputting the binary mask.
   */
  constructor(video, maskCanvas) {
    this.video = video;
    this.maskCanvas = maskCanvas;
    this.ctx = maskCanvas.getContext('2d');
    this.running = false;
    // effectType is retained for compatibility.
    this.effectType = 'none';
    this.lastSegmentationTime = 0;
    this.cachedSegmentation = null;
    this.segmenter = null;
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

  setEffectType(effectType) {
    this.effectType = effectType;
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
    const video = this.video;
    const maskCanvas = this.maskCanvas;
    const ctx = this.ctx;
    // Ensure the mask canvas matches the video dimensions.
    maskCanvas.width = video.videoWidth;
    maskCanvas.height = video.videoHeight;

    const now = Date.now();
    // Throttle segmentation to roughly 10 fps.
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

    // Generate and draw the binary mask if segmentation data is available.
    if (this.cachedSegmentation && this.cachedSegmentation.length > 0) {
      try {
        const binaryMaskData = await bodySegmentation.toBinaryMask(
          this.cachedSegmentation,
          { r: 255, g: 255, b: 255, a: 255 }, // white for foreground (person)
          { r: 0, g: 0, b: 0, a: 0 }, // transparent for background
          false, // no contour drawing
        );
        // Use the mask data as-is (foreground white, background transparent).
        maskCanvas.width = binaryMaskData.width;
        maskCanvas.height = binaryMaskData.height;
        ctx.putImageData(binaryMaskData, 0, 0);
      } catch (err) {
        console.error('Error processing binary mask:', err);
      }
    } else {
      ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    }

    requestAnimationFrame(() => this._tick());
  }
}
