// App.jsx
import React, { useState, useEffect } from 'react';
import useRealtime from './hooks/useRealtime';
import Controls from './components/Controls';
import EventLog from './components/EventLog';
import AudioSink from './components/AudioSink';
import MapPanel from './components/MapPanel';
import DockPanel from './components/DockPanel';
import LanguageSelector from './components/LanguageSelector';

export default function App() {
  const [language, setLanguage] = useState("es-MX-CDMX");

  useEffect(() => {
    const savedLang = localStorage.getItem("preferredLanguage");
    if (savedLang) setLanguage(savedLang);
  }, []);

  const {
    status,
    statusLabel,
    muted,
    events,
    connect,
    disconnect,
    toggleMute,
    restartSession,
    audioRef,
  } = useRealtime(language);

  const handleLanguageChange = async (langCode) => {
    setLanguage(langCode);
    localStorage.setItem("preferredLanguage", langCode);
    console.log("Language changed to:", langCode);
    restartSession(langCode);
  };
  
  return (
    <div className="app">
      <div className="app-main">
        <div className="app-header">
          <h1>Lupita</h1>
          <LanguageSelector selectedLang={language} onChange={handleLanguageChange} />
        </div>
        <AudioSink audioRef={audioRef} />
        <EventLog status={status} statusLabel={statusLabel} events={events} />
      </div>

      {/* New right-side map panel */}
      {/* <MapPanel events={events} /> */}

      {/* New left-side panel */}
      {/* <DockPanel events={events} /> */}

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
