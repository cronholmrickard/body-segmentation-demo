// TaskVisionSegmenter.js
import {
  ImageSegmenter,
  FilesetResolver,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2';

export default class TaskVisionSegmenter {
  /**
   * @param {HTMLVideoElement} video - The video element.
   * @param {HTMLCanvasElement} maskCanvas - Offscreen canvas for outputting the binary mask.
   */
  constructor(video, maskCanvas) {
    this.video = video;
    // The maskCanvas is used solely for generating the binary mask.
    this.maskCanvas = maskCanvas;
    this.ctx = maskCanvas.getContext('2d');
    this.running = false;
    this.effectType = 'none';
    this.segmenter = null;
    // Cache the previous ImageData to reuse if dimensions match.
    this.cachedMaskImageData = null;
    // Minimum delay between segmentation requests in ms.
    this.minSegmentationDelay = 100; // adjust for desired frequency
    this.lastSegmentationTime = 0;
    // Flag to ensure only one segmentation request is in flight.
    this.segmentationInFlight = false;
  }

  async loadModel() {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2/wasm',
      );
      this.segmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
    } catch (error) {
      console.error('Error loading MediaPipe Image Segmenter:', error);
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
    // Ensure the mask canvas matches video dimensions.
    maskCanvas.width = video.videoWidth;
    maskCanvas.height = video.videoHeight;

    // Always draw the cached mask so the compositor has a stable mask.
    if (this.cachedMaskImageData) {
      ctx.putImageData(this.cachedMaskImageData, 0, 0);
    } else {
      ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    }

    // Check if enough time has elapsed before launching a new segmentation request.
    const now = performance.now();
    if (
      !this.segmentationInFlight &&
      now - this.lastSegmentationTime >= this.minSegmentationDelay
    ) {
      this.segmentationInFlight = true;
      try {
        const segmentationResult = await this.segmenter.segmentForVideo(
          video,
          now,
        );
        this.lastSegmentationTime = performance.now();
        if (segmentationResult && segmentationResult.categoryMask) {
          const categoryMask = segmentationResult.categoryMask;
          const width = categoryMask.width;
          const height = categoryMask.height;
          const maskData = categoryMask.getAsUint8Array();
          const newImageData = ctx.createImageData(width, height);
          for (let i = 0; i < maskData.length; i++) {
            // Invert: if maskData[i] > 0 then background (alpha 0), else foreground (alpha 255).
            const newAlpha = maskData[i] > 0 ? 0 : 255;
            newImageData.data[i * 4] = 255;
            newImageData.data[i * 4 + 1] = 255;
            newImageData.data[i * 4 + 2] = 255;
            newImageData.data[i * 4 + 3] = newAlpha;
          }
          // Update cached mask (replace it completely).
          this.cachedMaskImageData = newImageData;
          ctx.putImageData(this.cachedMaskImageData, 0, 0);
          categoryMask.close();
        }
      } catch (err) {
        console.error('Segmentation error:', err);
      }
      this.segmentationInFlight = false;
    }
    requestAnimationFrame(() => this._tick());
  }
}
