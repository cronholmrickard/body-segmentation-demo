import React, { useRef, useState, useEffect } from 'react';
import BodySegmenter from '../lib/BodySegmenter';

const Hero = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  const [segmenterInstance, setSegmenterInstance] = useState(null);

  // Track whether the background effect is active.
  const [bgActive, setBgActive] = useState(false);

  // Refs for cleanup
  const streamRef = useRef(null);
  const segmenterInstanceRef = useRef(null);

  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  useEffect(() => {
    segmenterInstanceRef.current = segmenterInstance;
  }, [segmenterInstance]);

  // -----------------------------
  // 1) Start the camera
  // -----------------------------
  const startCamera = async () => {
    try {
      // Specify video constraints for a stable 640x480 resolution.
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
        // Mute the video so autoplay policies are satisfied.
        videoRef.current.muted = true;

        // Wait for metadata so dimensions are known, then explicitly call play().
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
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Could not access the camera.');
    }
  };

  // -----------------------------
  // 2) Stop the camera
  // -----------------------------
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setBgActive(false);
    if (segmenterInstanceRef.current) {
      segmenterInstanceRef.current.stop();
      setSegmenterInstance(null);
    }
  };

  // -----------------------------
  // 3) Enable background effect
  // -----------------------------
  const handleBackgroundButtonClick = () => {
    // Set bgActive to true (activating the background effect) if a stream exists.
    if (stream) {
      setBgActive(true);
    }
  };

  // -----------------------------
  // 4) Initialize BodySegmenter when bgActive is toggled on.
  // -----------------------------
  useEffect(() => {
    if (
      bgActive &&
      videoRef.current &&
      canvasRef.current &&
      !segmenterInstance
    ) {
      const initializeSegmenter = async () => {
        const instance = new BodySegmenter(videoRef.current, canvasRef.current);
        try {
          await instance.loadModel();
        } catch (err) {
          setError('Failed to load segmentation model.');
          return;
        }
        setSegmenterInstance(instance);
        instance.start(); // This starts the internal segmentation loop (_tick)
      };
      initializeSegmenter();
    }
  }, [bgActive, segmenterInstance]);

  // -----------------------------
  // 5) Cleanup on unmount only.
  // -----------------------------
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

  // -----------------------------
  // RENDER
  // -----------------------------
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
        {/* Buttons on the left */}
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
              // Flip the video horizontally for a mirror effect.
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
              transform: 'scaleX(-1)',
            }}
          />
        </div>

        {/* "Background" button on the right - always shown.
            It is disabled if no video stream is active or if bgActive is already true.
         */}
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
