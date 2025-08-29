// utils/logger.js
/**
 * Convert raw events[] into a list of utterances we care about.
 * Each utterance: { id, role: 'user'|'assistant'|'tool', text, at, name?, call_id? }
 *
 * - User speech: from conversation.item.input_audio_transcription.completed
 * - Assistant replies: from response.done (scan output[].content[])
 * - Function outputs: from conversation.item.created with item.type === 'function_call_output'
 */
export default function getUtterances(events = []) {
  const out = [];

  // Track function call_id -> function name to label outputs
  const callNames = Object.create(null);

  for (const ev of events) {
    // --- USER (ASR complete) ---
    if (ev.type === 'conversation.item.input_audio_transcription.completed') {
      const text = ev?.transcript?.trim();
      if (text) {
        out.push({
          id: ev.event_id,
          role: 'user',
          text,
          at: ev.timestamp,
        });
      }
      continue;
    }

    // --- ASSISTANT + FUNCTION-CALL PROPOSALS (from response.done) ---
    if (ev.type === 'response.done') {
      const output = ev?.response?.output ?? [];

      for (const item of output) {
        // Capture function-call metadata (arguments available on item.arguments)
        if (item?.type === 'function_call' && item?.call_id && item?.name) {
          callNames[item.call_id] = item.name;
          // If you also want to log the args, uncomment this:
          try {
            const args = JSON.parse(item.arguments ?? '{}');
            out.push({
              id: `${ev.event_id}:${item.id}:fn_args`,
              role: 'tool',
              name: item.name,
              call_id: item.call_id,
              text: `args: ${JSON.stringify(args)}`,
              at: ev.timestamp,
            });
          } catch {/* ignore parse errors */}
          continue;
        }

        // Assistant message items carry text/transcripts in their content array
        if (item?.type === 'message' && item?.role === 'assistant') {
          const c = item?.content ?? [];
          // NOTE: Do NOT read audio transcripts here to avoid duplicates.
          const text =
            c.find(p => p.type === 'output_text' && p.text)?.text ??
            c.find(p => p.type === 'text' && p.text)?.text ??
            '';

          if (text && text.trim()) {
            out.push({
              id: `${ev.event_id}:${item.id}`, // unique if multiple items
              role: 'assistant',
              text: text.trim(),
              at: ev.timestamp,
            });
          }
        }
      }
      continue;
    }

    // --- FUNCTION OUTPUTS (server echoes the item your client created) ---
    if (ev.type === 'conversation.item.created' &&
        ev?.item?.type === 'function_call_output') {
      const callId = ev.item.call_id;
      const name = callNames[callId]; // may be undefined if response.done not seen

      // item.output is a JSON string per docs; parse for readable text
      let text = '';
      try {
        const parsed = JSON.parse(ev.item.output ?? '""');
        text = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
      } catch {
        text = ev.item.output ?? '';
      }

      if (text && text.trim()) {
        out.push({
          id: ev.event_id,
          role: 'tool',       // change to 'assistant' if you prefer a 2-role timeline
          name,
          call_id: callId,
          text: text.trim(),
          at: ev.timestamp,
        });
      }
      continue;
    }

    // --- OPTIONAL: audio transcripts via response.audio_transcript.done ---
    // Removed to prevent duplicate assistant messages when audio is enabled.
    // If you ever re-enable it, make sure to guard so it only runs when
    // response.done did not already produce a message for the same utterance.
    //
    if (ev.type === 'response.audio_transcript.done') {
      const text = ev?.transcript?.trim();
      if (text) {
        out.push({
          id: ev.event_id,
          role: 'assistant',
          text,
          at: ev.timestamp,
        });
      }
      continue;
    }
  }

  // If needed, you could sort here: out.sort((a, b) => new Date(a.at) - new Date(b.at));
  return out;
}
