import React, { useRef, useState, useEffect } from 'react';
import BodySegmenter from '../lib/BodySegmenter';

const Hero = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);

  // This is the active segmenter that is running the segmentation loop.
  const [segmenterInstance, setSegmenterInstance] = useState(null);
  // Preloaded segmenter with model loaded, ready to be activated.
  const [preloadedSegmenter, setPreloadedSegmenter] = useState(null);

  // Track whether the background effect is active.
  const [bgActive, setBgActive] = useState(false);

  // Refs for cleanup so that our cleanup effect doesn't run on every state change.
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
        videoRef.current.muted = true;
        // Wait for video metadata to load, then play.
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

        // Preload the segmentation model if not already loaded.
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

  // -----------------------------
  // 2) Stop the camera and segmentation
  // -----------------------------
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setBgActive(false);
    // Stop the active segmenter (if any) but keep the preloaded one.
    if (segmenterInstanceRef.current) {
      segmenterInstanceRef.current.stop();
      setSegmenterInstance(null);
    }
  };

  // -------------------------------------
  // 3) Activate background effect
  // -------------------------------------
  const handleBackgroundButtonClick = () => {
    // Only activate if there's an active stream.
    if (stream) {
      setBgActive(true);
    }
  };

  // -------------------------------------
  // 4) Initialize (or activate) BodySegmenter when bgActive becomes true.
  // -------------------------------------
  useEffect(() => {
    if (
      bgActive &&
      videoRef.current &&
      canvasRef.current &&
      !segmenterInstance
    ) {
      // If we already preloaded a segmenter, use it.
      if (preloadedSegmenter) {
        setSegmenterInstance(preloadedSegmenter);
        preloadedSegmenter.start(); // Start its segmentation loop.
        console.log('Activated preloaded segmentation model.');
      } else {
        // Fallback: load the model if it wasn't preloaded.
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
          instance.start();
        };
        initializeSegmenter();
      }
    }
  }, [bgActive, segmenterInstance, preloadedSegmenter]);

  // -------------------------------------
  // 5) Cleanup on unmount only.
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
        {/* Control buttons */}
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

        {/* Fixed-size container for video + canvas */}
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
              // Mirror the video so that it appears as a mirror reflection.
              transform: 'scaleX(-1)',
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
              display: bgActive ? 'block' : 'none',
              // Mirror the canvas so that it appears as a mirror reflection.
              transform: 'scaleX(-1)',
            }}
          />
        </div>

        {/* Background button is always shown, but disabled if there's no stream or if bgActive is already true */}
        <div
          style={{
            marginLeft: '20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <button
            onClick={handleBackgroundButtonClick}
            disabled={!stream || bgActive}
          >
            Background
          </button>
        </div>
      </div>
    </div>
  );
};

export default Hero;
