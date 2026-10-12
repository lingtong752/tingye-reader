import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Book, SpeechStyle } from "../types";
import {
  pickPreferredVoice,
  splitIntoSpeechSegments,
  type SpeechSegment,
} from "../lib/speech";
import { splitIntoParagraphs } from "../lib/text";

interface SpeechPlayerOptions {
  book: Book | null;
  chapterIndex: number;
  rate: number;
  voiceURI: string;
  speechStyle: SpeechStyle;
  onChapterChange: (index: number) => void;
  onParagraphChange: (index: number) => void;
}

type PlaybackStatus = "idle" | "playing" | "paused";

export function useSpeechPlayer({
  book,
  chapterIndex,
  rate,
  voiceURI,
  speechStyle,
  onChapterChange,
  onParagraphChange,
}: SpeechPlayerOptions) {
  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [paragraphIndex, setParagraphIndex] = useState(0);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [segmentCount, setSegmentCount] = useState(0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [sleepEndsAt, setSleepEndsAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;
  const paragraphs = useMemo(
    () =>
      book?.chapters[chapterIndex]
        ? splitIntoParagraphs(book.chapters[chapterIndex].content)
        : [],
    [book, chapterIndex],
  );

  const bookRef = useRef(book);
  const paragraphsRef = useRef(paragraphs);
  const chapterIndexRef = useRef(chapterIndex);
  const paragraphIndexRef = useRef(0);
  const segmentIndexRef = useRef(0);
  const statusRef = useRef<PlaybackStatus>("idle");
  const rateRef = useRef(rate);
  const voiceURIRef = useRef(voiceURI);
  const speechStyleRef = useRef(speechStyle);
  const voicesRef = useRef(voices);
  const activeSegmentsRef = useRef<SpeechSegment[]>([]);
  const generationRef = useRef(0);
  const pauseTimerRef = useRef<number | null>(null);
  const sleepTimerRef = useRef<number | null>(null);
  const pausedBetweenSegmentsRef = useRef(false);

  useEffect(() => {
    bookRef.current = book;
  }, [book]);

  useEffect(() => {
    paragraphsRef.current = paragraphs;
  }, [paragraphs]);

  useEffect(() => {
    rateRef.current = rate;
    voiceURIRef.current = voiceURI;
    speechStyleRef.current = speechStyle;
  }, [rate, speechStyle, voiceURI]);

  useEffect(() => {
    voicesRef.current = voices;
  }, [voices]);

  useEffect(() => {
    if (!supported) return;

    const updateVoices = () => {
      const preferred = pickPreferredVoice(window.speechSynthesis.getVoices());
      const sorted = [...window.speechSynthesis.getVoices()].sort((a, b) => {
        const languageRank = (language: string) => {
          if (/^zh[-_]CN$/i.test(language)) return 0;
          if (/^zh[-_]Hans/i.test(language)) return 1;
          if (/^zh[-_]HK$/i.test(language)) return 2;
          if (/^zh[-_]TW$/i.test(language)) return 3;
          if (/^zh/i.test(language)) return 4;
          return 5;
        };
        return (
          languageRank(a.lang) - languageRank(b.lang) ||
          a.name.localeCompare(b.name, "zh-CN")
        );
      });

      if (preferred) {
        const preferredIndex = sorted.findIndex(
          (voice) => voice.voiceURI === preferred.voiceURI,
        );
        if (preferredIndex > 0) {
          sorted.unshift(sorted.splice(preferredIndex, 1)[0]);
        }
      }
      setVoices(sorted);
    };

    updateVoices();
    window.speechSynthesis.addEventListener("voiceschanged", updateVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", updateVoices);
    };
  }, [supported]);

  const clearPauseTimer = useCallback(() => {
    if (pauseTimerRef.current !== null) {
      window.clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
  }, []);

  const cancelPlayback = useCallback(() => {
    generationRef.current += 1;
    clearPauseTimer();
    pausedBetweenSegmentsRef.current = false;
    if (supported) window.speechSynthesis.cancel();
  }, [clearPauseTimer, supported]);

  const speakAtRef = useRef<(index: number) => void>(() => undefined);
  const speakSegmentRef = useRef<
    (generation: number, index: number) => void
  >(() => undefined);

  const failPlayback = useCallback(
    (message: string, generation: number) => {
      if (generation !== generationRef.current) return;
      cancelPlayback();
      setStatus("idle");
      statusRef.current = "idle";
      setNotice(null);
      setError(message);
    },
    [cancelPlayback],
  );

  const speakSegment = useCallback(
    (generation: number, index: number) => {
      if (
        !supported ||
        generation !== generationRef.current ||
        statusRef.current !== "playing"
      ) {
        return;
      }

      const segments = activeSegmentsRef.current;
      if (index >= segments.length) {
        speakAtRef.current(paragraphIndexRef.current + 1);
        return;
      }

      const segment = segments[index];
      segmentIndexRef.current = index;
      setSegmentIndex(index);

      const utterance = new SpeechSynthesisUtterance(segment.text);
      const selectedVoice =
        voicesRef.current.find(
          (voice) => voice.voiceURI === voiceURIRef.current,
        ) ?? pickPreferredVoice(voicesRef.current);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
      } else {
        utterance.lang = "zh-CN";
      }
      utterance.rate = Math.min(
        2,
        Math.max(0.5, rateRef.current * segment.rateScale),
      );
      utterance.pitch = Math.min(1.18, Math.max(0.8, segment.pitch));
      utterance.onstart = () => {
        if (generation === generationRef.current) {
          setError(null);
          setNotice(null);
        }
      };
      utterance.onend = () => {
        if (
          generation !== generationRef.current ||
          statusRef.current !== "playing"
        ) {
          return;
        }
        segmentIndexRef.current = index + 1;
        setSegmentIndex(index + 1);
        pauseTimerRef.current = window.setTimeout(() => {
          pauseTimerRef.current = null;
          speakSegmentRef.current(generation, index + 1);
        }, segment.pauseMs);
      };
      utterance.onerror = (event) => {
        if (event.error !== "interrupted" && event.error !== "canceled") {
          failPlayback(`系统语音播放失败：${event.error}`, generation);
        }
      };
      window.speechSynthesis.speak(utterance);
    },
    [failPlayback, supported],
  );

  useEffect(() => {
    speakSegmentRef.current = speakSegment;
  }, [speakSegment]);

  const speakAt = useCallback(
    (index: number) => {
      const currentBook = bookRef.current;
      if (!supported || !currentBook) return;

      const currentParagraphs = paragraphsRef.current;
      if (index >= currentParagraphs.length) {
        const nextChapter = chapterIndexRef.current + 1;
        if (nextChapter < currentBook.chapters.length) {
          cancelPlayback();
          chapterIndexRef.current = nextChapter;
          paragraphIndexRef.current = 0;
          setParagraphIndex(0);
          setSegmentIndex(0);
          setSegmentCount(0);
          onParagraphChange(0);
          onChapterChange(nextChapter);
          const generation = generationRef.current;
          pauseTimerRef.current = window.setTimeout(() => {
            pauseTimerRef.current = null;
            if (
              generation === generationRef.current &&
              statusRef.current === "playing"
            ) {
              speakAtRef.current(0);
            }
          }, 360);
        } else {
          cancelPlayback();
          setStatus("idle");
          statusRef.current = "idle";
          setNotice("本书已朗读完毕");
        }
        return;
      }

      cancelPlayback();
      paragraphIndexRef.current = Math.max(0, index);
      setParagraphIndex(paragraphIndexRef.current);
      onParagraphChange(paragraphIndexRef.current);
      const segments = splitIntoSpeechSegments(
        currentParagraphs[paragraphIndexRef.current],
        speechStyleRef.current,
      );
      activeSegmentsRef.current = segments;
      segmentIndexRef.current = 0;
      setSegmentIndex(0);
      setSegmentCount(segments.length);
      speakSegmentRef.current(generationRef.current, 0);
    },
    [cancelPlayback, onChapterChange, onParagraphChange, supported],
  );

  useEffect(() => {
    speakAtRef.current = speakAt;
  }, [speakAt]);

  const play = useCallback(
    (startIndex?: number) => {
      if (!supported || !bookRef.current) return;
      setError(null);
      setNotice(null);

      if (statusRef.current === "paused" && startIndex === undefined) {
        setStatus("playing");
        statusRef.current = "playing";
        if (pausedBetweenSegmentsRef.current) {
          pausedBetweenSegmentsRef.current = false;
          speakSegmentRef.current(
            generationRef.current,
            segmentIndexRef.current,
          );
        } else {
          window.speechSynthesis.resume();
        }
        return;
      }

      setStatus("playing");
      statusRef.current = "playing";
      speakAt(startIndex ?? paragraphIndexRef.current);
    },
    [speakAt, supported],
  );

  const pause = useCallback(() => {
    if (!supported || statusRef.current !== "playing") return;
    pausedBetweenSegmentsRef.current = pauseTimerRef.current !== null;
    clearPauseTimer();
    if (!pausedBetweenSegmentsRef.current) {
      window.speechSynthesis.pause();
    }
    setStatus("paused");
    statusRef.current = "paused";
  }, [clearPauseTimer, supported]);

  const stop = useCallback(() => {
    cancelPlayback();
    setStatus("idle");
    statusRef.current = "idle";
    setError(null);
    setNotice(null);
  }, [cancelPlayback]);

  const seek = useCallback(
    (index: number) => {
      const nextIndex = Math.max(
        0,
        Math.min(index, Math.max(paragraphsRef.current.length - 1, 0)),
      );
      paragraphIndexRef.current = nextIndex;
      setParagraphIndex(nextIndex);
      setSegmentIndex(0);
      setSegmentCount(0);
      onParagraphChange(nextIndex);

      if (statusRef.current === "playing") {
        speakAt(nextIndex);
      } else if (statusRef.current === "paused") {
        cancelPlayback();
        setStatus("idle");
        statusRef.current = "idle";
      }
    },
    [cancelPlayback, onParagraphChange, speakAt],
  );

  const setSleepTimer = useCallback(
    (minutes: number | null) => {
      if (sleepTimerRef.current !== null) {
        window.clearTimeout(sleepTimerRef.current);
      }
      sleepTimerRef.current = null;
      setSleepEndsAt(null);

      if (minutes && minutes > 0) {
        setSleepEndsAt(Date.now() + minutes * 60_000);
        sleepTimerRef.current = window.setTimeout(() => {
          stop();
          setSleepEndsAt(null);
        }, minutes * 60_000);
      }
    },
    [stop],
  );

  useEffect(() => {
    const chapterChanged = chapterIndexRef.current !== chapterIndex;
    chapterIndexRef.current = chapterIndex;
    if (!chapterChanged || statusRef.current === "playing") return;

    cancelPlayback();
    paragraphIndexRef.current = 0;
    setParagraphIndex(0);
    setSegmentIndex(0);
    setSegmentCount(0);
  }, [cancelPlayback, chapterIndex]);

  useEffect(() => {
    cancelPlayback();
    setStatus("idle");
    statusRef.current = "idle";
    paragraphIndexRef.current = 0;
    setParagraphIndex(0);
    setSegmentIndex(0);
    setSegmentCount(0);
    setError(null);
    setNotice(null);
  }, [book?.id, cancelPlayback]);

  useEffect(() => {
    if (statusRef.current === "playing") {
      speakAt(paragraphIndexRef.current);
    }
  }, [rate, speakAt, speechStyle, voiceURI]);

  useEffect(
    () => () => {
      cancelPlayback();
      if (sleepTimerRef.current !== null) {
        window.clearTimeout(sleepTimerRef.current);
      }
    },
    [cancelPlayback],
  );

  return {
    supported,
    voices,
    status,
    paragraphs,
    paragraphIndex,
    segmentIndex,
    segmentCount,
    sleepEndsAt,
    error,
    notice,
    play,
    pause,
    stop,
    seek,
    setSleepTimer,
  };
}
