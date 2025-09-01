// App.jsx
import React from 'react';
import useRealtime from './hooks/useRealtime';
import Controls from './components/Controls';
import EventLog from './components/EventLog';
import AudioSink from './components/AudioSink';
import MapPanel from './components/MapPanel';

export default function App() {
  const {
    status,
    muted,
    events,
    connect,
    disconnect,
    toggleMute,
    audioRef,
  } = useRealtime();

  return (
    <div className="app">
      <div className="app-main">
        <h1>Realtime AI Conversation</h1>
        <AudioSink audioRef={audioRef} />
        <EventLog status={status} events={events} />
      </div>

      {/* New right-side map panel */}
      <MapPanel events={events}/>

      {/* Stick this to the bottom */}
      <Controls
        status={status}
        muted={muted}
        onConnect={connect}
        onDisconnect={disconnect}
        onToggleMute={toggleMute}
      />
    </div>
  );
}
