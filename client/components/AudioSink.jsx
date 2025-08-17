// AudioSink.jsx
import React from 'react';

export default function AudioSink({ audioRef }) {
  return <audio ref={audioRef} autoPlay />;
}