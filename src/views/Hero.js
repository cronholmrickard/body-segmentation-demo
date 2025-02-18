import React, { useRef, useState, useEffect } from 'react';
import BodySegmenter from '../lib/BodySegmenter';

const Hero = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);

  // Active segmentation instance (runs the segmentation loop)
  const [segmenterInstance, setSegmenterInstance] = useState(null);
  // Preloaded segmentation instance with model loaded, ready for activation.
  const [preloadedSegmenter, setPreloadedSegmenter] = useState(null);

  /**
   * effectType: "none" | "blur" | "static"
   * "none": No background effect.
   * "blur": Apply blurred background (bokeh).
   * "static": Composite a static background image.
   */
  const [effectType, setEffectType] = useState('none');

  // Refs for cleanup.
  const streamRef = useRef(null);
  const segmenterInstanceRef = useRef(null);

  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);
  useEffect(() => {
    segmenterInstanceRef.current = segmenterInstance;
  }, [segmenterInstance]);

  // -------------------------------------
  // 1) Start the camera and preload model
  // -------------------------------------
  const startCamera = async () => {
    try {
      const constraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(
        constraints,
      );
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.muted = true; // Required for autoplay
        await new Promise((resolve) => {
          videoRef.current.onloadedmetadata = () => {
            videoRef.current
              .play()
              .then(resolve)
              .catch((err) => {
                console.error('Video play error:', err);
                resolve();
              });
          };
        });

        // Preload segmentation model if not already preloaded.
        if (!preloadedSegmenter) {
          const tempSegmenter = new BodySegmenter(
            videoRef.current,
            canvasRef.current,
          );
          try {
            await tempSegmenter.loadModel();
            setPreloadedSegmenter(tempSegmenter);
            console.log('Segmentation model preloaded.');
          } catch (err) {
            console.error('Failed to preload segmentation model:', err);
            setError('Failed to preload segmentation model.');
          }
        }
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Could not access the camera.');
    }
  };

  // -------------------------------------
  // 2) Stop the camera and segmentation
  // -------------------------------------
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    // Reset effectType to "none" and stop active segmentation.
    setEffectType('none');
    if (segmenterInstanceRef.current) {
      segmenterInstanceRef.current.stop();
      setSegmenterInstance(null);
    }
  };

  // -------------------------------------
  // 3) Activate blur background effect.
  // -------------------------------------
  const handleStartBlur = () => {
    if (stream) {
      setEffectType('blur');
    }
  };

  // -------------------------------------
  // 4) Activate static background effect.
  // -------------------------------------
  const handleStartStatic = () => {
    if (stream) {
      setEffectType('static');
    }
  };

  // -------------------------------------
  // 5) Stop any background effect.
  // -------------------------------------
  const handleStopEffect = () => {
    setEffectType('none');
    if (segmenterInstanceRef.current) {
      segmenterInstanceRef.current.stop();
      setSegmenterInstance(null);
    }
  };

  // -------------------------------------
  // 6) Initialize (or activate) BodySegmenter when effectType is not "none".
  // -------------------------------------
  useEffect(() => {
    if (
      effectType !== 'none' &&
      videoRef.current &&
      canvasRef.current &&
      !segmenterInstance
    ) {
      // Activate the preloaded segmenter if available.
      if (preloadedSegmenter) {
        setSegmenterInstance(preloadedSegmenter);
        // Tell the segmenter which effect to apply.
        preloadedSegmenter.setEffectType(effectType);
        preloadedSegmenter.start(); // starts its internal loop (_tick)
        console.log(
          'Activated preloaded segmentation model with effect:',
          effectType,
        );
      } else {
        // Fallback: initialize a new segmenter.
        const initializeSegmenter = async () => {
          const instance = new BodySegmenter(
            videoRef.current,
            canvasRef.current,
          );
          try {
            await instance.loadModel();
          } catch (err) {
            setError('Failed to load segmentation model.');
            return;
          }
          setSegmenterInstance(instance);
          instance.setEffectType(effectType);
          instance.start();
        };
        initializeSegmenter();
      }
    }
  }, [effectType, segmenterInstance, preloadedSegmenter]);

  // -------------------------------------
  // 7) Update active segmenter's effect type when effectType changes.
  // -------------------------------------
  useEffect(() => {
    if (segmenterInstance) {
      segmenterInstance.setEffectType(effectType);
    }
  }, [effectType, segmenterInstance]);

  // -------------------------------------
  // 8) Cleanup on unmount only.
  // -------------------------------------
  useEffect(() => {
    return () => {
      if (segmenterInstanceRef.current) {
        segmenterInstanceRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // -------------------------------------
  // RENDER
  // -------------------------------------
  return (
    <div style={{ textAlign: 'center' }}>
      <h1>Body Segmentation Demo</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'start',
        }}
      >
        {/* Left-side controls */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginRight: '20px',
          }}
        >
          <button onClick={startCamera} style={{ marginBottom: '10px' }}>
            Start Camera
          </button>
          <button onClick={stopCamera}>Stop Camera</button>
        </div>

        {/* Video and canvas container */}
        <div style={{ position: 'relative', width: '640px', height: '480px' }}>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '640px',
              height: '480px',
              background: '#333',
              transform: 'scaleX(-1)', // Mirror effect.
            }}
          />
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '640px',
              height: '480px',
              display: effectType !== 'none' ? 'block' : 'none',
              transform: 'scaleX(-1)', // Mirror effect.
            }}
          />
        </div>

        {/* Right-side controls */}
        <div
          style={{
            marginLeft: '20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <button
            onClick={handleStartBlur}
            disabled={!stream || effectType !== 'none'}
            style={{ marginBottom: '10px' }}
          >
            Start Blur Background
          </button>
          <button
            onClick={handleStartStatic}
            disabled={!stream || effectType !== 'none'}
            style={{ marginBottom: '10px' }}
          >
            Start Static Background
          </button>
          <button onClick={handleStopEffect} disabled={effectType === 'none'}>
            Stop Background Effect
          </button>
        </div>
      </div>
    </div>
  );
};

export default Hero;
