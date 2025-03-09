// Hero.jsx
import React, { useRef, useState, useEffect } from 'react';
import BodySegmenter from '../lib/BodySegmenter';
import TaskVisionSegmenter from '../lib/TaskVisionSegmenter';
import WebGLSegmenterRenderer from '../lib/WebGLSegmenterRenderer';

const Hero = () => {
  const videoRef = useRef(null);
  // canvasRef is the offscreen mask canvas used by both segmentation classes.
  const canvasRef = useRef(null);
  // glCanvasRef is where the final GL composite is rendered.
  const glCanvasRef = useRef(null);

  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  const [segmenterInstance, setSegmenterInstance] = useState(null);
  const [preloadedSegmenter, setPreloadedSegmenter] = useState(null);
  // Toggle: true = use BodySegmenter, false = use TaskVisionSegmenter.
  const [useBodySegmenter, setUseBodySegmenter] = useState(true);
  // effectType: "none" | "blur" | "static"
  const [effectType, setEffectType] = useState('none');

  // Refs for cleanup.
  const streamRefLocal = useRef(null);
  const segmenterInstanceRef = useRef(null);
  useEffect(() => {
    streamRefLocal.current = stream;
  }, [stream]);
  useEffect(() => {
    segmenterInstanceRef.current = segmenterInstance;
  }, [segmenterInstance]);

  // Cache the background image in a ref so it's loaded only once.
  const backgroundImgRef = useRef(null);
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = process.env.PUBLIC_URL
      ? process.env.PUBLIC_URL + '/background.png'
      : '/background.png';
    img.onload = () => {
      console.log('Background image loaded:', img.width, img.height);
      backgroundImgRef.current = img;
    };
    img.onerror = () => {
      console.error('Error loading background image.');
    };
  }, []);

  // 1) Start camera and preload model.
  const startCamera = async () => {
    try {
      const constraints = {
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
      };
      const mediaStream = await navigator.mediaDevices.getUserMedia(
        constraints,
      );
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.muted = true;
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
        if (!preloadedSegmenter) {
          const SegmenterClass = useBodySegmenter
            ? BodySegmenter
            : TaskVisionSegmenter;
          const tempSegmenter = new SegmenterClass(
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

  // 2) Stop camera and segmentation.
  const stopCamera = () => {
    if (streamRefLocal.current) {
      streamRefLocal.current.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setEffectType('none');
    if (segmenterInstanceRef.current) {
      segmenterInstanceRef.current.stop();
      setSegmenterInstance(null);
    }
  };

  // 3) Activate effects.
  const handleStartBlur = () => {
    if (stream) setEffectType('blur');
  };
  const handleStartStatic = () => {
    if (stream) setEffectType('static');
  };
  const handleStopEffect = () => {
    setEffectType('none');
    if (segmenterInstanceRef.current) {
      segmenterInstanceRef.current.stop();
      setSegmenterInstance(null);
    }
  };

  // 4) Toggle segmentation type.
  const handleToggleSegmenter = (e) => {
    const newValue = e.target.checked;
    if (effectType !== 'none') {
      handleStopEffect();
    }
    setPreloadedSegmenter(null);
    setUseBodySegmenter(newValue);
  };

  // 5) Initialize (or activate) segmentation.
  useEffect(() => {
    if (effectType !== 'none' && videoRef.current) {
      if (preloadedSegmenter) {
        setSegmenterInstance(preloadedSegmenter);
        preloadedSegmenter.setEffectType(effectType);
        preloadedSegmenter.start();
        console.log(
          `Activated preloaded segmentation model (${
            useBodySegmenter ? 'BodySegmenter' : 'TaskVisionSegmenter'
          }) with effect:`,
          effectType,
        );
      } else {
        const initializeSegmenter = async () => {
          const SegmenterClass = useBodySegmenter
            ? BodySegmenter
            : TaskVisionSegmenter;
          const instance = new SegmenterClass(
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
  }, [effectType, preloadedSegmenter, useBodySegmenter]);

  // 6) Update effect type on active segmenter.
  useEffect(() => {
    if (segmenterInstance) {
      segmenterInstance.setEffectType(effectType);
    }
  }, [effectType, segmenterInstance]);

  // 7) GL compositing loop (central composition for both segmentation classes).
  useEffect(() => {
    let glAnimationFrame;
    if (
      effectType !== 'none' &&
      segmenterInstance &&
      glCanvasRef.current &&
      backgroundImgRef.current
    ) {
      glCanvasRef.current.width = videoRef.current.videoWidth;
      glCanvasRef.current.height = videoRef.current.videoHeight;
      const renderer = new WebGLSegmenterRenderer(
        videoRef.current,
        backgroundImgRef.current,
        canvasRef.current,
        glCanvasRef.current,
      );
      const glRenderLoop = () => {
        renderer.render();
        glAnimationFrame = requestAnimationFrame(glRenderLoop);
      };
      glRenderLoop();
    }
    return () => {
      if (glAnimationFrame) cancelAnimationFrame(glAnimationFrame);
    };
  }, [effectType, segmenterInstance]);

  // 8) Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (segmenterInstanceRef.current) {
        segmenterInstanceRef.current.stop();
      }
      if (streamRefLocal.current) {
        streamRefLocal.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div style={{ textAlign: 'center' }}>
      <h1>Segmentation Demo</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <div style={{ marginBottom: '10px' }}>
        <label>
          <input
            type='checkbox'
            checked={useBodySegmenter}
            onChange={handleToggleSegmenter}
          />
          Use BodySegmenter (checked) / TaskVisionSegmenter (unchecked)
        </label>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'start',
        }}
      >
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
              transform: 'scaleX(-1)',
            }}
          />
          {/* The offscreen mask canvas (used for composition) is hidden */}
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          {/* GL output canvas */}
          <canvas
            ref={glCanvasRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '640px',
              height: '480px',
              display: effectType !== 'none' ? 'block' : 'none',
              transform: 'scaleX(-1)',
            }}
          />
        </div>
        <div
          style={{
            marginLeft: '20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'start',
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
