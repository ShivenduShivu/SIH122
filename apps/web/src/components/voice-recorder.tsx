'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './icon';
import { pcmWav } from '../lib/wav-encoder';
export function VoiceRecorder({
  onRecording,
  disabled,
  onBusyChange,
}: {
  onBusyChange: (busy: boolean) => void;
  onRecording: (file: File) => void;
  disabled: boolean;
}) {
  const [state, setState] = useState<'idle' | 'requesting' | 'recording'>('idle'),
    [seconds, setSeconds] = useState(0),
    [error, setError] = useState('');
  const live = useRef<{
      stream: MediaStream;
      context: AudioContext;
      node: AudioWorkletNode;
      chunks: Float32Array[];
      done: boolean;
      finish: () => void;
    } | null>(null),
    alive = useRef(true),
    request = useRef(0);
  const stop = () => {
    const current = live.current;
    if (!current) return;
    current.node.port.postMessage('stop');
    // A suspended phone audio context may never flush its last worklet message.
    // Preserve chunks already received and release the microphone in that case.
    window.setTimeout(() => {
      if (live.current === current && !current.done) current.finish();
    }, 700);
  };
  const cleanup = () => {
    const s = live.current;
    if (s) {
      s.done = true;
      s.stream.getTracks().forEach((t) => t.stop());
      s.node.disconnect();
      void s.context.close();
      live.current = null;
    }
  };
  useEffect(() => {
    onBusyChange(state !== 'idle');
  }, [state, onBusyChange]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      request.current++;
      cleanup();
    };
  }, []);
  useEffect(() => {
    if (state !== 'recording') return;
    const started = Date.now(),
      timer = setInterval(() => {
        setSeconds(Math.min(25, Math.floor((Date.now() - started) / 1000)));
        if (Date.now() - started >= 25000) stop();
      }, 200);
    return () => clearInterval(timer);
  }, [state]);
  async function start() {
    setError('');
    setState('requesting');
    setSeconds(0);
    const attempt = ++request.current;
    let stream: MediaStream | undefined, context: AudioContext | undefined;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error('secure');
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      if (!alive.current || attempt !== request.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      context = new AudioContext();
      await context.resume();
      await context.audioWorklet.addModule('/field-recorder.js');
      if (!alive.current || attempt !== request.current) {
        stream.getTracks().forEach((t) => t.stop());
        await context.close();
        return;
      }
      const node = new AudioWorkletNode(context, 'field-recorder'),
        source = context.createMediaStreamSource(stream),
        gain = context.createGain();
      gain.gain.value = 0;
      const current = {
        stream,
        context,
        node,
        chunks: [] as Float32Array[],
        done: false,
        finish: () => {},
      };
      live.current = current;
      current.finish = () => {
        if (current.done) return;
        const file = pcmWav(current.chunks, current.context.sampleRate);
        cleanup();
        if (alive.current) {
          setState('idle');
          if (file.size > 44) onRecording(file);
          else setError('No recording was captured. Please try again.');
        }
      };
      node.port.onmessage = (e) => {
        if (current.done) return;
        if (e.data.samples) current.chunks.push(e.data.samples);
        if (e.data.done) {
          current.finish();
        }
      };
      context.onstatechange = () => {
        if (context?.state !== 'running' && live.current === current) {
          setError('Recording was interrupted. Listen to the captured part before sending.');
          stop();
        }
      };
      stream.getAudioTracks().forEach((t) => {
        t.onended = () => {
          if (live.current === current) {
            setError('Microphone stopped. Check the captured recording.');
            stop();
          }
        };
      });
      source.connect(node);
      node.connect(gain);
      gain.connect(context.destination);
      setState('recording');
    } catch (e) {
      stream?.getTracks().forEach((t) => t.stop());
      if (context && context.state !== 'closed') await context.close();
      if (alive.current) {
        setState('idle');
        setError(
          e instanceof Error && e.message === 'secure'
            ? 'Microphone recording needs HTTPS or localhost. You can type instead.'
            : e instanceof DOMException && e.name === 'NotAllowedError'
              ? 'Microphone permission was denied. Allow it in browser settings or type instead.'
              : 'The microphone could not start. Check your device or type instead.',
        );
      }
    }
  }
  return (
    <section className="voice-recording" aria-label="Voice recording">
      <button
        type="button"
        className={`voice-record-button ${state === 'recording' ? 'recording' : ''}`}
        disabled={disabled || state === 'requesting'}
        onClick={() => (state === 'recording' ? stop() : void start())}
      >
        <Icon name="microphone" size={26} />
        {state === 'recording'
          ? 'Stop recording'
          : state === 'requesting'
            ? 'Waiting for microphone…'
            : 'Start recording'}
      </button>
      <p role="status">
        {state === 'recording'
          ? `${seconds} / 25 seconds · Recording`
          : 'Up to 25 seconds. Say the work area, what changed and when.'}
      </p>
      {state === 'requesting' && (
        <button
          type="button"
          className="button"
          onClick={() => {
            request.current++;
            setState('idle');
          }}
        >
          Cancel microphone request
        </button>
      )}
      {error && (
        <p className="validation-notice" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
