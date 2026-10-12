import type { SpeechStyle } from "../types";

type SpeechEmotion =
  | "neutral"
  | "warm"
  | "question"
  | "excited"
  | "hesitant"
  | "solemn";

export interface SpeechSegment {
  text: string;
  pauseMs: number;
  pitch: number;
  rateScale: number;
}

interface SpeechStyleProfile {
  pitch: number;
  rateScale: number;
  pauseScale: number;
}

export const speechStyleProfiles: Record<SpeechStyle, SpeechStyleProfile> = {
  immersive: {
    pitch: 0.97,
    rateScale: 0.92,
    pauseScale: 1.22,
  },
  natural: {
    pitch: 1,
    rateScale: 0.98,
    pauseScale: 1,
  },
  clear: {
    pitch: 1,
    rateScale: 1.03,
    pauseScale: 0.78,
  },
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

function getPunctuationPause(text: string): number {
  if (/[…]{2,}|\.{3,}/.test(text)) return 620;
  if (/[！？!?][”’」』]?$/.test(text)) return 410;
  if (/[。.]([”’」』])?$/.test(text)) return 340;
  if (/[；;][”’」』]?$/.test(text)) return 280;
  if (/[：:][”’」』]?$/.test(text)) return 250;
  if (/[,，][”’」』]?$/.test(text)) return 150;
  return 190;
}

function detectEmotion(
  phrase: string,
  isDialogue: boolean,
  paragraphIndex: number,
): SpeechEmotion {
  if (/[？?][”’」』]?$/.test(phrase)) return "question";
  if (/[！!][”’」』]?$/.test(phrase)) return "excited";
  if (/[…]{2,}|\.{3,}/.test(phrase)) return "hesitant";
  if (/沉默|离开|告别|死亡|再也|永远|黑暗|叹了口气/.test(phrase)) {
    return "solemn";
  }
  if (
    isDialogue ||
    /微笑|笑着|轻声|温柔|安心|阳光|回家/.test(phrase) ||
    paragraphIndex === 0
  ) {
    return "warm";
  }
  return "neutral";
}

function createSpeechSegment(
  phrase: string,
  style: SpeechStyle,
  paragraphIndex: number,
): SpeechSegment {
  const profile = speechStyleProfiles[style];
  const isQuestion = /[？?][”’」』]?$/.test(phrase);
  const isExclamation = /[！!][”’」』]?$/.test(phrase);
  const isEllipsis = /[…]{2,}|\.{3,}/.test(phrase);
  const isDialogue =
    /[“「『]/.test(phrase) || /[”」』][，,。！？!?]?$/.test(phrase);
  const emotion = detectEmotion(phrase, isDialogue, paragraphIndex);

  let pitch = profile.pitch;
  let rateScale = profile.rateScale;

  if (isQuestion) {
    pitch += 0.07;
    rateScale *= 0.95;
  } else if (isExclamation) {
    pitch += 0.04;
    rateScale *= 0.98;
  }

  if (isDialogue) {
    pitch += 0.025;
    rateScale *= 0.97;
  }

  if (isEllipsis) {
    pitch -= 0.025;
    rateScale *= 0.9;
  }

  if (emotion === "solemn") {
    pitch -= 0.03;
    rateScale *= 0.94;
  } else if (emotion === "warm") {
    pitch += 0.01;
  }

  return {
    text: phrase,
    pauseMs: Math.round(getPunctuationPause(phrase) * profile.pauseScale),
    pitch: clamp(pitch, 0.8, 1.18),
    rateScale: clamp(rateScale, 0.68, 1.25),
  };
}

export function splitIntoSpeechSegments(
  text: string,
  style: SpeechStyle,
): SpeechSegment[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const phrases =
    normalized.match(
      /[^，,。！？!?；;：:…]+(?:…{2,}|\.{3,}|[，,。！？!?；;：:]+)?[”’」』]?/g,
    ) ?? [normalized];

  return phrases
    .map((phrase) => phrase.trim())
    .filter(Boolean)
    .map((phrase, index) => createSpeechSegment(phrase, style, index));
}

export function pickPreferredVoice(
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | undefined {
  const qualityPattern =
    /premium|enhanced|natural|xiaoxiao|yunxi|tingting|yu-shu|语舒|晓晓|云希|婷婷/i;
  const languageRank = (language: string) => {
    if (/^zh[-_]CN$/i.test(language)) return 0;
    if (/^zh[-_]Hans/i.test(language)) return 1;
    if (/^zh/i.test(language)) return 2;
    return 3;
  };

  return [...voices].sort((a, b) => {
    const languageDifference = languageRank(a.lang) - languageRank(b.lang);
    if (languageDifference) return languageDifference;

    const qualityDifference =
      Number(qualityPattern.test(b.name)) - Number(qualityPattern.test(a.name));
    if (qualityDifference) return qualityDifference;

    const localDifference = Number(b.localService) - Number(a.localService);
    if (localDifference) return localDifference;

    return a.name.localeCompare(b.name, "zh-CN");
  })[0];
}
