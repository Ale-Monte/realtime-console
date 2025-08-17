// components/Controls.jsx
import React from 'react';

export default function Controls({ status, muted, onConnect, onDisconnect, onToggleMute }) {
  return (
    <div className="controls">
      <div className="controls-inner">
        {status !== 'connected' ? (
          <button
            className="btn btn--state-connect"
            onClick={onConnect}
            disabled={status === 'connecting'}
          >
            {status === 'connecting' ? 'Connecting…' : 'Connect'}
          </button>
        ) : (
          <button
            className="btn btn--state-disconnect"
            onClick={onDisconnect}
          >
            Disconnect
          </button>
        )}

        <button
          className="btn"
          onClick={onToggleMute}
          disabled={status !== 'connected'}
        >
          {muted ? 'Unmute mic' : 'Mute mic'}
        </button>
      </div>
    </div>
  );
}
