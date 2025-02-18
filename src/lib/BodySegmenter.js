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
    this.running = false;
    // effectType can be "none", "blur", or "static"
    this.effectType = 'none';
    this.lastSegmentationTime = 0;
    this.cachedSegmentation = null;
    this.staticImage = null; // will hold our preloaded static background image
    this.segmenter = null; // our segmentation model instance
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
    const startTime = Date.now();
    const video = this.video;
    const canvas = this.canvas;
    const ctx = this.ctx;

    // Ensure canvas dimensions match video dimensions.
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const now = Date.now();
    // Throttle segmentation to roughly 10 fps.
    if (now - this.lastSegmentationTime >= 100) {
      try {
        this.cachedSegmentation = await this.segmenter.segmentPeople(video, {
          // When using a mirrored video, consider using flipHorizontal: true.
          flipHorizontal: false,
          multiSegmentation: false,
        });
      } catch (err) {
        console.error('Segmentation error:', err);
      }
      this.lastSegmentationTime = now;
    }

    // Clear the canvas.
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (this.effectType === 'blur') {
      // Apply the built-in bokeh effect.
      await bodySegmentation.drawBokehEffect(
        canvas,
        video,
        this.cachedSegmentation,
        1.0, // foreground opacity (person fully opaque)
        12, // blur strength
        2, // edge blur amount
        false, // flipHorizontal flag; adjust if needed
      );
    } else if (this.effectType === 'static') {
      // Load the static background image once.
      if (!this.staticImage) {
        this.staticImage = new Image();
        // Use PUBLIC_URL if available, otherwise default to '/background.png'
        this.staticImage.src = process.env.PUBLIC_URL
          ? process.env.PUBLIC_URL + '/background.png'
          : '/background.png';
        console.log('Loading static image from:', this.staticImage.src);
        await new Promise((resolve, reject) => {
          this.staticImage.onload = resolve;
          this.staticImage.onerror = reject;
        });
      }
      // Draw the static background on the main canvas.
      ctx.drawImage(this.staticImage, 0, 0, canvas.width, canvas.height);

      // If segmentation data is available, composite the person over the static background.
      if (this.cachedSegmentation && this.cachedSegmentation.length > 0) {
        try {
          // Generate a binary mask from the segmentation.
          // This mask will have white (foreground) where the person is.
          const binaryMaskData = await bodySegmentation.toBinaryMask(
            this.cachedSegmentation,
            { r: 255, g: 255, b: 255, a: 255 }, // white for the person
            { r: 0, g: 0, b: 0, a: 0 }, // transparent for the background
            false, // no contour drawing
          );

          // Create an offscreen canvas for the mask.
          const maskCanvas = document.createElement('canvas');
          maskCanvas.width = binaryMaskData.width;
          maskCanvas.height = binaryMaskData.height;
          const maskCtx = maskCanvas.getContext('2d');
          maskCtx.putImageData(binaryMaskData, 0, 0);

          // Now create a temporary canvas to composite the person.
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = canvas.width;
          tempCanvas.height = canvas.height;
          const tempCtx = tempCanvas.getContext('2d');

          // Draw the current video frame onto the temporary canvas.
          tempCtx.drawImage(video, 0, 0, canvas.width, canvas.height);
          // Apply the mask by setting the composite operation to 'destination-in'.
          tempCtx.globalCompositeOperation = 'destination-in';
          tempCtx.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height);

          // Now, composite the person (from the temporary canvas) on top of the static background.
          ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
        } catch (err) {
          console.error('Error processing binary mask for static effect:', err);
        }
      }
    } else {
      // "none": simply draw the video frame.
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    // Schedule the next frame.
    const elapsed = Date.now() - startTime;
    const delay = Math.max(0, 40 - elapsed); // aiming for ~25 fps
    setTimeout(() => this._tick(), delay);
  }
}
