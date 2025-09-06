// App.jsx
import React from 'react';
import useRealtime from './hooks/useRealtime';
import Controls from './components/Controls';
import EventLog from './components/EventLog';
import AudioSink from './components/AudioSink';
import MapPanel from './components/MapPanel';
import DockPanel from './components/DockPanel';

export default function App() {
  const {
    status,
    statusLabel,
    muted,
    events,
    connect,
    disconnect,
    toggleMute,
    audioRef,
  } = useRealtime({ locale: 'es' });

  return (
    <div className="app">
      <div className="app-main">
        <h1>Lupita</h1>
        <AudioSink audioRef={audioRef} />
        <EventLog status={status} statusLabel={statusLabel} events={events} />
      </div>

      {/* New right-side map panel */}
      <MapPanel events={events} />

      {/* New left-side panel */}
      <DockPanel events={events} />

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
