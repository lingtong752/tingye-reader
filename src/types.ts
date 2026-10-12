export type BookFormat = "txt" | "epub" | "sample";
export type ReaderTheme = "paper" | "white" | "night";
export type FontFamily = "serif" | "sans";
export type SpeechStyle = "immersive" | "natural" | "clear";

export interface Chapter {
  id: string;
  title: string;
  content: string;
}

export interface ReadingProgress {
  chapterIndex: number;
  paragraphIndex: number;
  scrollRatio: number;
  updatedAt: number;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  format: BookFormat;
  coverColor: string;
  coverImage?: string;
  createdAt: number;
  updatedAt: number;
  chapters: Chapter[];
  progress: ReadingProgress;
}

export interface ReaderSettings {
  fontSize: number;
  lineHeight: number;
  contentWidth: number;
  theme: ReaderTheme;
  fontFamily: FontFamily;
  rate: number;
  voiceURI: string;
  speechStyle: SpeechStyle;
}
