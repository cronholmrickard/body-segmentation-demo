// Hero.jsx
import React, { useRef, useState, useEffect } from 'react';
import BodySegmenter from '../lib/BodySegmenter'; // if you have one
import TaskVisionSegmenter from '../lib/TaskVisionSegmenter';
import WebGLSegmenterRenderer from '../lib/WebGLSegmenterRenderer';

const Hero = () => {
  const videoRef = useRef(null);
  // canvasRef is used as the offscreen mask canvas for TaskVisionSegmenter.
  const canvasRef = useRef(null);
  // glCanvasRef is used for the WebGL output.
  const glCanvasRef = useRef(null);

  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  const [segmenterInstance, setSegmenterInstance] = useState(null);
  const [preloadedSegmenter, setPreloadedSegmenter] = useState(null);
  // Toggle state: true = use BodySegmenter, false = use TaskVisionSegmenter.
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
          // For TaskVisionSegmenter, pass canvasRef as the mask canvas.
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

  // 7) GL compositing loop for both segmentation types.
  useEffect(() => {
    let glAnimationFrame;
    if (effectType !== 'none' && segmenterInstance && glCanvasRef.current) {
      // Create a background image element.
      const backgroundImg = new Image();
      backgroundImg.crossOrigin = 'anonymous';
      backgroundImg.src = process.env.PUBLIC_URL
        ? process.env.PUBLIC_URL + '/background.png'
        : '/background.png';
      backgroundImg.onload = () => {
        // Set output canvas dimensions.
        glCanvasRef.current.width = videoRef.current.videoWidth;
        glCanvasRef.current.height = videoRef.current.videoHeight;
        // Create the GL renderer using the video, background, and mask (canvasRef).
        const renderer = new WebGLSegmenterRenderer(
          videoRef.current,
          backgroundImg,
          canvasRef.current,
          glCanvasRef.current,
        );
        const glRenderLoop = () => {
          renderer.render();
          glAnimationFrame = requestAnimationFrame(glRenderLoop);
        };
        glRenderLoop();
      };
      backgroundImg.onerror = () => {
        console.error('Error loading background image.');
      };
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
          {/* Hide the offscreen mask canvas */}
          <canvas
            ref={canvasRef}
            style={{
              display: 'none',
            }}
          />
          {/* Always show the GL output for compositing */}
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
