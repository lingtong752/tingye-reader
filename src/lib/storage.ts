import type { Book, ReaderSettings } from "../types";

const DATABASE_NAME = "tingye-reader";
const DATABASE_VERSION = 1;
const BOOK_STORE = "books";
const SETTINGS_KEY = "tingye-reader-settings";

export const defaultSettings: ReaderSettings = {
  fontSize: 20,
  lineHeight: 1.9,
  contentWidth: 720,
  theme: "paper",
  fontFamily: "serif",
  rate: 1,
  voiceURI: "",
  speechStyle: "immersive",
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeReaderSettings(value: unknown): ReaderSettings {
  if (!value || typeof value !== "object") return defaultSettings;
  const saved = value as Record<string, unknown>;

  const theme =
    saved.theme === "paper" ||
    saved.theme === "white" ||
    saved.theme === "night"
      ? saved.theme
      : defaultSettings.theme;
  const fontFamily =
    saved.fontFamily === "serif" || saved.fontFamily === "sans"
      ? saved.fontFamily
      : defaultSettings.fontFamily;
  const speechStyle =
    saved.speechStyle === "immersive" ||
    saved.speechStyle === "natural" ||
    saved.speechStyle === "clear"
      ? saved.speechStyle
      : defaultSettings.speechStyle;

  return {
    fontSize:
      typeof saved.fontSize === "number" && Number.isFinite(saved.fontSize)
        ? clamp(saved.fontSize, 15, 29)
        : defaultSettings.fontSize,
    lineHeight:
      typeof saved.lineHeight === "number" && Number.isFinite(saved.lineHeight)
        ? clamp(saved.lineHeight, 1.45, 2.25)
        : defaultSettings.lineHeight,
    contentWidth:
      typeof saved.contentWidth === "number" &&
      Number.isFinite(saved.contentWidth)
        ? clamp(saved.contentWidth, 560, 880)
        : defaultSettings.contentWidth,
    theme,
    fontFamily,
    rate:
      typeof saved.rate === "number" && Number.isFinite(saved.rate)
        ? clamp(saved.rate, 0.75, 2)
        : defaultSettings.rate,
    voiceURI:
      typeof saved.voiceURI === "string"
        ? saved.voiceURI
        : defaultSettings.voiceURI,
    speechStyle,
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(BOOK_STORE)) {
        database.createObjectStore(BOOK_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function completeTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function listBooks(): Promise<Book[]> {
  const database = await openDatabase();
  const transaction = database.transaction(BOOK_STORE, "readonly");
  const request = transaction.objectStore(BOOK_STORE).getAll();

  const books = await new Promise<Book[]>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as Book[]);
    request.onerror = () => reject(request.error);
  });

  database.close();
  return books.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveBook(book: Book): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(BOOK_STORE, "readwrite");
  transaction.objectStore(BOOK_STORE).put(book);
  await completeTransaction(transaction);
  database.close();
}

export async function deleteBook(bookId: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(BOOK_STORE, "readwrite");
  transaction.objectStore(BOOK_STORE).delete(bookId);
  await completeTransaction(transaction);
  database.close();
}

export function loadSettings(): ReaderSettings {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (!saved) return defaultSettings;
    return normalizeReaderSettings(JSON.parse(saved));
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: ReaderSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
