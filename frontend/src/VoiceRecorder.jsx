import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2 } from 'lucide-react';

const formats = ['audio/webm', 'audio/ogg', 'audio/mp4'];

export default function VoiceRecorder({ onChange, busy, setBusy }) {
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState('');
  const [recording, setRecording] = useState(false);
  const control = useRef(null);
  const alive = useRef(true);

  useEffect(() => () => {
    alive.current = false;
    control.current?.stop();
  }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function record() {
    setBusy(true);
    setStatus('');
    let stream;
    try {
      const mime = formats.find(type => globalThis.MediaRecorder?.isTypeSupported(type));
      if (!mime || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Za snemanje odpri Sotovor na tem računalniku ali prek HTTPS v podprtem brskalniku.');
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      const recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 64000 });
      const chunks = [];
      const stop = () => { if (recorder.state === 'recording') recorder.stop(); };
      let timer;
      let failed = false;
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { failed = true; };
      recorder.onstop = () => {
        clearTimeout(timer);
        stream.getTracks().forEach(track => track.stop());
        control.current = null;
        if (!alive.current) return;
        setRecording(false);
        const blob = new Blob(chunks, { type: mime });
        if (failed || !blob.size || blob.size > 2 * 1024 * 1024) {
          setStatus('Posnetka ni bilo mogoče shraniti. Poskusi znova.');
          setBusy(false);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          if (!alive.current) return;
          onChange({ mime, data: reader.result.split(',')[1] });
          setPreview(URL.createObjectURL(blob));
          setBusy(false);
        };
        reader.onerror = () => {
          if (!alive.current) return;
          setStatus('Posnetka ni bilo mogoče prebrati.');
          setBusy(false);
        };
        reader.readAsDataURL(blob);
      };
      recorder.start();
      timer = setTimeout(stop, 30_000);
      control.current = { stop };
      setRecording(true);
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      if (!alive.current) return;
      setStatus(error.name === 'NotAllowedError' ? 'Za snemanje dovoli dostop do mikrofona.' : error.message);
      setBusy(false);
    }
  }

  return <div className="voice-field">
    {recording ? <button type="button" className="soft-button" onClick={() => control.current?.stop()}><Square size={16} /> Ustavi snemanje</button> :
      preview ? <><audio controls src={preview} aria-label="Predogled posnetka" />
        <button type="button" className="icon-button" aria-label="Odstrani posnetek" onClick={() => { setPreview(''); onChange(null); }}><Trash2 size={16} /></button></> :
        <button type="button" className="soft-button" disabled={busy} onClick={record}><Mic size={17} /> Posnemi beležko</button>}
    {recording && <p role="status">Snemam, največ 30 sekund.</p>}
    {status && <p className="error" role="alert">{status}</p>}
  </div>;
}
