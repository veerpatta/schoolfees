"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Dictate a student search instead of typing it.
 *
 * Two decisions worth knowing before changing anything here.
 *
 * **Support is checked, not assumed.** The Web Speech API is absent on iOS
 * Safari and on most in-app browsers. `supported` is false there and the
 * caller must not render the mic at all — a button that does nothing when
 * tapped is worse than no button, and this app's rule is that nothing on
 * screen may lie about what it can do.
 *
 * **Recognition always runs as `en-IN`, whatever the UI language is.** Student
 * names and SR numbers are stored in Latin script. A Hindi-locale clerk saying
 * "Rahul Sharma" under `hi-IN` gets back "राहुल शर्मा", which matches nothing
 * in the database — the feature would appear broken precisely for the users
 * the Hindi UI exists for. `en-IN` is trained on Indian names and returns the
 * script the data is actually in.
 */

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionResultEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate =
    (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor })
      .SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor })
      .webkitSpeechRecognition;
  return candidate ?? null;
}

export function useVoiceSearch(onTranscript: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Kept in a ref so starting a session never depends on a stale closure and
  // the effect below does not have to re-run on every parent render.
  const callbackRef = useRef(onTranscript);
  callbackRef.current = onTranscript;

  // Detection runs in an effect, not during render: `window` does not exist
  // on the server, and a mic that appears only after hydration is correct
  // here — rendering it during SSR would flash a control we cannot honour.
  useEffect(() => {
    setSupported(getRecognitionConstructor() !== null);
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Recognition = getRecognitionConstructor();
    if (!Recognition) return;

    // A second tap while listening should cancel, not stack sessions.
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
      setListening(false);
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (typeof transcript === "string" && transcript.trim()) {
        callbackRef.current(transcript.trim());
      }
    };

    // A denied mic permission, no network, or silence all land here. There is
    // nothing useful to say — the clerk can just type — so we fall silent
    // rather than raising a toast about a feature they did not commit to.
    recognition.onerror = () => {
      recognitionRef.current = null;
      setListening(false);
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };

    recognitionRef.current = recognition;
    setListening(true);
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
    }
  }, []);

  return { supported, listening, start, stop };
}
