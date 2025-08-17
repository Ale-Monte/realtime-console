// utils/logger.js
/**
 * Convert raw events[] into a list of utterances we care about.
 * Each utterance: { id, role: 'user'|'assistant', text, at }
 */
export default function getUtterances(events = []) {
  const out = [];

  for (const ev of events) {
    // --- USER ---
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

    // --- ASSISTANT (final audio transcript) ---
    /* if (ev.type === 'response.audio_transcript.done') {
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
    } */

    // --- ASSISTANT fallbacks (finalized items/responses) ---
    /* if (ev.type === 'response.output_item.done') {
      // Try to pull a transcript or text from the finalized item
      const c = ev?.item?.content ?? [];
      const text =
        c.find(p => p.type === 'audio' && p.transcript)?.transcript ??
        c.find(p => p.type === 'output_text' && p.text)?.text ??
        c.find(p => p.type === 'text' && p.text)?.text ??
        '';

      if (text.trim()) {
        out.push({
          id: ev.event_id,
          role: 'assistant',
          text: text.trim(),
          at: ev.timestamp,
        });
      }
      continue;
    } */

    if (ev.type === 'response.done') {
      // Another fallback if you prefer to rely on the top-level response
      const out0 = ev?.response?.output?.[0]?.content ?? [];
      const text =
        out0.find(p => p.type === 'audio' && p.transcript)?.transcript ??
        out0.find(p => p.type === 'output_text' && p.text)?.text ??
        out0.find(p => p.type === 'text' && p.text)?.text ??
        '';
      if (text.trim()) {
        out.push({
          id: ev.event_id,
          role: 'assistant',
          text: text.trim(),
          at: ev.timestamp,
        });
      }
      continue;
    }
  }

  // Keep only in-order first occurrences; optionally sort by time if needed
  // return out.sort((a, b) => new Date(a.at) - new Date(b.at));
  return out;
}
