// components/Controls.jsx
import React from 'react';

function getControlsText(language = '') {
  if (String(language).toLowerCase().startsWith('es')) {
    return {
      connecting: 'Conectando...',
      connect: 'Conectar',
      disconnect: 'Desconectar',
      unmute: 'Activar micrófono',
      mute: 'Silenciar micrófono',
    };
  }

  return {
    connecting: 'Connecting...',
    connect: 'Connect',
    disconnect: 'Disconnect',
    unmute: 'Unmute microphone',
    mute: 'Mute microphone',
  };
}

export default function Controls({
  status,
  muted,
  onConnect,
  onDisconnect,
  onToggleMute,
  language = '',
}) {
  const text = getControlsText(language);

  return (
    <div className="controls">
      <div className="controls-inner">
        {status !== 'connected' ? (
          <button
            className="btn btn--state-connect"
            onClick={onConnect}
            disabled={status === 'connecting'}
          >
            {status === 'connecting' ? text.connecting : text.connect}
          </button>
        ) : (
          <button
            className="btn btn--state-disconnect"
            onClick={onDisconnect}
          >
            {text.disconnect}
          </button>
        )}

        <button
          className="btn"
          onClick={onToggleMute}
          disabled={status !== 'connected'}
        >
          {muted ? text.unmute : text.mute}
        </button>
      </div>
    </div>
  );
}
