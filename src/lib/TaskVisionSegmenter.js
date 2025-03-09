// TaskVisionSegmenter.js
import {
  ImageSegmenter,
  FilesetResolver,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2';

export default class TaskVisionSegmenter {
  constructor(video, maskCanvas) {
    this.video = video;
    // The maskCanvas is used solely for generating the binary mask.
    this.maskCanvas = maskCanvas;
    this.ctx = maskCanvas.getContext('2d');
    this.running = false;
    this.effectType = 'none';
    this.segmenter = null;
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
          delegate: 'GPU',
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
    this._tick();
  }

  stop() {
    this.running = false;
  }

  async _tick() {
    if (!this.running) return;
    const video = this.video;
    const ctx = this.ctx;
    // Resize mask canvas to match video dimensions.
    this.maskCanvas.width = video.videoWidth;
    this.maskCanvas.height = video.videoHeight;

    const timestamp = performance.now();
    let segmentationResult = null;
    try {
      segmentationResult = await this.segmenter.segmentForVideo(
        video,
        timestamp,
      );
    } catch (err) {
      console.error('Segmentation error:', err);
    }
    // If no effect, just clear the mask canvas with the video frame.
    if (this.effectType === 'none') {
      ctx.drawImage(video, 0, 0, this.maskCanvas.width, this.maskCanvas.height);
    } else if (segmentationResult && segmentationResult.categoryMask) {
      const categoryMask = segmentationResult.categoryMask;
      const width = categoryMask.width;
      const height = categoryMask.height;
      const maskData = categoryMask.getAsUint8Array();
      const imageData = ctx.createImageData(width, height);
      // Invert the mask so that the person (foreground) becomes opaque.
      for (let i = 0; i < maskData.length; i++) {
        const value = maskData[i] > 0 ? 0 : 255;
        imageData.data[i * 4] = 255;
        imageData.data[i * 4 + 1] = 255;
        imageData.data[i * 4 + 2] = 255;
        imageData.data[i * 4 + 3] = value;
      }
      ctx.putImageData(imageData, 0, 0);
      categoryMask.close();
    }
    requestAnimationFrame(() => this._tick());
  }
}
