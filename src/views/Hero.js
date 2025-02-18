import React, { useState, useRef, useEffect } from 'react';

const Hero = () => {
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Could not access the camera.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        {/* Button column */}
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
        {/* Video element */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          style={{
            width: '80%',
            maxWidth: '600px',
            border: '2px solid #ccc',
            marginBottom: '10px',
          }}
        ></video>
      </div>
    </div>
  );
};

export default Hero;
