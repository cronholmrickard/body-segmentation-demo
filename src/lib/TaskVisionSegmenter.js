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
    // Minimum delay (in ms) between segmentation requests.
    this.minSegmentationDelay = 100;
    this.lastSegmentationTime = 0;
    // Flag for whether a segmentation request is in flight.
    this.segmentationInFlight = false;
    // Cache for the mask array to avoid reallocating every frame.
    this.cachedMaskArray = null;
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
    this.lastSegmentationTime = performance.now();
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
    // Update mask canvas dimensions to match the video.
    maskCanvas.width = video.videoWidth;
    maskCanvas.height = video.videoHeight;

    // Always render the current cached mask so the display stays stable.
    if (this.cachedMaskImageData) {
      ctx.putImageData(this.cachedMaskImageData, 0, 0);
    } else {
      ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    }

    const now = performance.now();
    // Only start a new segmentation if enough time has elapsed and none is in flight.
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

          // Reuse cached mask array if possible.
          if (
            !this.cachedMaskArray ||
            this.cachedMaskArray.length !== maskData.length
          ) {
            this.cachedMaskArray = new Uint8ClampedArray(maskData.length);
          }
          // Fill a new ImageData using the cached mask array.
          const newImageData = ctx.createImageData(width, height);
          for (let i = 0; i < maskData.length; i++) {
            // Invert: if maskData[i] > 0, background (alpha 0), else foreground (alpha 255).
            const newAlpha = maskData[i] > 0 ? 0 : 255;
            newImageData.data[i * 4] = 255;
            newImageData.data[i * 4 + 1] = 255;
            newImageData.data[i * 4 + 2] = 255;
            newImageData.data[i * 4 + 3] = newAlpha;
            this.cachedMaskArray[i * 4 + 3] = newAlpha;
          }
          // Instead of allocating a new ImageData each time, update cachedMaskImageData if dimensions match.
          if (
            this.cachedMaskImageData &&
            this.cachedMaskImageData.width === width &&
            this.cachedMaskImageData.height === height
          ) {
            this.cachedMaskImageData.data.set(newImageData.data);
          } else {
            this.cachedMaskImageData = newImageData;
          }
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
