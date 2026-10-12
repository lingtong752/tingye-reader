import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Library,
  List,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Trash2,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { SpeechPlayer } from "./components/SpeechPlayer";
import { useSpeechPlayer } from "./hooks/useSpeechPlayer";
import { importBookFile } from "./lib/importBook";
import {
  deleteBook,
  listBooks,
  loadSettings,
  saveBook,
  saveSettings,
} from "./lib/storage";
import { calculateBookProgress, splitIntoParagraphs } from "./lib/text";
import { createSampleBook } from "./sampleBook";
import type {
  Book,
  ReaderSettings,
  ReaderTheme,
} from "./types";

type View = "library" | "reader";
type Drawer = "contents" | "settings" | null;

const formatLabels = {
  txt: "TXT",
  epub: "EPUB",
  sample: "示例",
} as const;

const themeLabels: Record<ReaderTheme, string> = {
  paper: "纸张",
  white: "纯白",
  night: "夜间",
};

function formatReadingTime(book: Book): string {
  const characters = book.chapters.reduce(
    (total, chapter) => total + chapter.content.length,
    0,
  );
  return `${Math.max(1, Math.round(characters / 380))} 分钟`;
}

function truncateTitle(title: string): string {
  return title.length > 18 ? `${title.slice(0, 18)}…` : title;
}

export function App() {
  const [books, setBooks] = useState<Book[]>([]);
  const [view, setView] = useState<View>("library");
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [settings, setSettings] = useState<ReaderSettings>(() => loadSettings());
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [playerExpanded, setPlayerExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [bookMenuId, setBookMenuId] = useState<string | null>(null);
  const [libraryReady, setLibraryReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const readingSurfaceRef = useRef<HTMLElement>(null);
  const saveTimerRef = useRef<number | null>(null);

  const activeBook =
    books.find((book) => book.id === activeBookId) ?? null;
  const activeChapter = activeBook?.chapters[chapterIndex] ?? null;
  const readingParagraphs = useMemo(
    () => (activeChapter ? splitIntoParagraphs(activeChapter.content) : []),
    [activeChapter],
  );

  const updateBookProgress = useCallback(
    (
      nextChapterIndex: number,
      paragraphIndex: number,
      scrollRatio?: number,
    ) => {
      if (!activeBookId) return;

      setBooks((current) => {
        const nextBooks = current.map((book) =>
          book.id === activeBookId
            ? {
                ...book,
                updatedAt: Date.now(),
                progress: {
                  chapterIndex: nextChapterIndex,
                  paragraphIndex,
                  scrollRatio:
                    scrollRatio ?? book.progress.scrollRatio ?? 0,
                  updatedAt: Date.now(),
                },
              }
            : book,
        );
        const nextBook = nextBooks.find((book) => book.id === activeBookId);

        if (nextBook) {
          if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = window.setTimeout(() => {
            void saveBook(nextBook);
          }, 220);
        }
        return nextBooks;
      });
    },
    [activeBookId],
  );

  const handleSpeechChapterChange = useCallback(
    (nextIndex: number) => {
      setChapterIndex(nextIndex);
      updateBookProgress(nextIndex, 0, 0);
      readingSurfaceRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    },
    [updateBookProgress],
  );

  const handleSpeechParagraphChange = useCallback(
    (paragraphIndex: number) => {
      updateBookProgress(chapterIndex, paragraphIndex);
    },
    [chapterIndex, updateBookProgress],
  );

  const speech = useSpeechPlayer({
    book: activeBook,
    chapterIndex,
    rate: settings.rate,
    voiceURI: settings.voiceURI,
    speechStyle: settings.speechStyle,
    onChapterChange: handleSpeechChapterChange,
    onParagraphChange: handleSpeechParagraphChange,
  });

  useEffect(() => {
    if (!speech.voices.length) return;
    const selectedVoiceExists = speech.voices.some(
      (voice) => voice.voiceURI === settings.voiceURI,
    );
    if (selectedVoiceExists) return;

    const preferredVoice =
      speech.voices.find((voice) => /^zh[-_]CN$/i.test(voice.lang)) ??
      speech.voices.find((voice) => /^zh/i.test(voice.lang)) ??
      speech.voices[0];
    setSettings((current) => ({
      ...current,
      voiceURI: preferredVoice.voiceURI,
    }));
  }, [settings.voiceURI, speech.voices]);

  useEffect(() => {
    void (async () => {
      try {
        let storedBooks = await listBooks();
        if (!storedBooks.length) {
          const sample = createSampleBook();
          await saveBook(sample);
          storedBooks = [sample];
        }
        setBooks(storedBooks);
        setActiveBookId(storedBooks[0].id);
        setChapterIndex(storedBooks[0].progress.chapterIndex);
      } catch {
        const sample = createSampleBook();
        setBooks([sample]);
        setActiveBookId(sample.id);
        setChapterIndex(sample.progress.chapterIndex);
        setNotice("浏览器未允许本地存储，本次阅读进度可能无法保留");
      } finally {
        setLibraryReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (import.meta.env.PROD) {
      void navigator.serviceWorker.register("/sw.js", {
        updateViaCache: "none",
      });
      return;
    }

    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      void Promise.all(
        registrations.map((registration) => registration.unregister()),
      );
    });
    if ("caches" in window) {
      void caches.keys().then((keys) => {
        void Promise.all(
          keys
            .filter((key) => key.startsWith("tingye-shell-"))
            .map((key) => caches.delete(key)),
        );
      });
    }
  }, []);

  useEffect(() => {
    if (view !== "reader") return;
    const surface = readingSurfaceRef.current;
    if (!surface || !activeBook) return;

    window.requestAnimationFrame(() => {
      const maxScroll = Math.max(surface.scrollHeight - surface.clientHeight, 0);
      surface.scrollTop = maxScroll * activeBook.progress.scrollRatio;
    });
  }, [activeBook?.id, chapterIndex, view]);

  useEffect(() => {
    const paragraph = document.querySelector(
      `[data-paragraph-index="${speech.paragraphIndex}"]`,
    );
    if (
      paragraph &&
      speech.status === "playing" &&
      paragraph instanceof HTMLElement
    ) {
      paragraph.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [speech.paragraphIndex, speech.status]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    },
    [],
  );

  const filteredBooks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
    if (!normalizedQuery) return books;
    return books.filter(
      (book) =>
        book.title.toLocaleLowerCase("zh-CN").includes(normalizedQuery) ||
        book.author.toLocaleLowerCase("zh-CN").includes(normalizedQuery),
    );
  }, [books, query]);

  const openBook = (book: Book) => {
    speech.stop();
    setActiveBookId(book.id);
    setChapterIndex(book.progress.chapterIndex);
    setDrawer(null);
    setBookMenuId(null);
    setView("reader");
  };

  const closeReader = () => {
    speech.stop();
    setDrawer(null);
    setPlayerExpanded(false);
    setView("library");
  };

  const changeChapter = (nextIndex: number) => {
    if (!activeBook) return;
    const safeIndex = Math.max(
      0,
      Math.min(nextIndex, activeBook.chapters.length - 1),
    );
    speech.stop();
    setChapterIndex(safeIndex);
    updateBookProgress(safeIndex, 0, 0);
    setDrawer(null);
    readingSurfaceRef.current?.scrollTo({ top: 0 });
  };

  const handleScroll = () => {
    const surface = readingSurfaceRef.current;
    if (!surface || !activeBook) return;
    const maxScroll = surface.scrollHeight - surface.clientHeight;
    const ratio = maxScroll > 0 ? surface.scrollTop / maxScroll : 0;
    updateBookProgress(
      chapterIndex,
      activeBook.progress.paragraphIndex,
      ratio,
    );
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    setIsImporting(true);
    setNotice(null);
    const imported: Book[] = [];
    const failures: string[] = [];

    for (const file of files) {
      try {
        const book = await importBookFile(file);
        await saveBook(book);
        imported.push(book);
      } catch (error) {
        failures.push(
          `${file.name}：${error instanceof Error ? error.message : "导入失败"}`,
        );
      }
    }

    if (imported.length) {
      setBooks((current) => [...imported, ...current]);
      setNotice(`已导入 ${imported.length} 本书`);
    }
    if (failures.length) setNotice(failures.join("；"));
    setIsImporting(false);
    event.target.value = "";
  };

  const handleDelete = async (
    event: ReactMouseEvent,
    bookId: string,
  ) => {
    event.stopPropagation();
    setBookMenuId(null);
    await deleteBook(bookId);
    setBooks((current) => current.filter((book) => book.id !== bookId));
    setNotice("已从书架移除");
  };

  const updateSettings = (patch: Partial<ReaderSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  };

  return (
    <div
      className={`app app--${view} theme-${settings.theme}`}
      data-testid="app"
    >
      {view === "library" ? (
        <LibraryView
          books={filteredBooks}
          allBookCount={books.length}
          query={query}
          isImporting={isImporting}
          libraryReady={libraryReady}
          bookMenuId={bookMenuId}
          onQueryChange={setQuery}
          onImport={() => fileInputRef.current?.click()}
          onOpenBook={openBook}
          onBookMenu={setBookMenuId}
          onDelete={handleDelete}
        />
      ) : activeBook && activeChapter ? (
        <ReaderView
          book={activeBook}
          chapterIndex={chapterIndex}
          paragraphs={readingParagraphs}
          settings={settings}
          drawer={drawer}
          playerExpanded={playerExpanded}
          speech={speech}
          surfaceRef={readingSurfaceRef}
          onBack={closeReader}
          onDrawerChange={setDrawer}
          onPlayerExpandedChange={setPlayerExpanded}
          onChapterChange={changeChapter}
          onSettingsChange={updateSettings}
          onScroll={handleScroll}
        />
      ) : null}

      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept=".txt,.epub,text/plain,application/epub+zip"
        multiple
        onChange={handleImport}
      />

      {notice && (
        <button
          className="toast"
          type="button"
          onClick={() => setNotice(null)}
          aria-label="关闭提示"
        >
          <span>{notice}</span>
          <X size={16} />
        </button>
      )}
    </div>
  );
}
interface LibraryViewProps {
  books: Book[];
  allBookCount: number;
  query: string;
  isImporting: boolean;
  libraryReady: boolean;
  bookMenuId: string | null;
  onQueryChange: (query: string) => void;
  onImport: () => void;
  onOpenBook: (book: Book) => void;
  onBookMenu: (bookId: string | null) => void;
  onDelete: (event: ReactMouseEvent, bookId: string) => void;
}

function LibraryView({
  books,
  allBookCount,
  query,
  isImporting,
  libraryReady,
  bookMenuId,
  onQueryChange,
  onImport,
  onOpenBook,
  onBookMenu,
  onDelete,
}: LibraryViewProps) {
  const recentBook = books[0] ?? null;

  return (
    <div className="library-shell">
      <aside className="sidebar">
        <div className="brand" aria-label="听页">
          <span className="brand-mark">听</span>
          <span>听页</span>
        </div>

        <nav className="sidebar-nav" aria-label="主导航">
          <button className="nav-item nav-item--active" type="button">
            <Library size={19} />
            <span>书架</span>
          </button>
          <button className="nav-item" type="button" disabled>
            <Clock3 size={19} />
            <span>最近阅读</span>
          </button>
        </nav>

        <div className="sidebar-foot">
          <Volume2 size={17} />
          <div>
            <strong>免费本地朗读</strong>
            <span>正文不上传云端</span>
          </div>
        </div>
      </aside>

      <main className="library-main">
        <header className="library-header">
          <div>
            <p className="eyebrow">我的书架</p>
            <h1>继续读下去</h1>
          </div>
          <div className="header-actions">
            <label className="search-field">
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="搜索书名或作者"
                aria-label="搜索书名或作者"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => onQueryChange("")}
                  aria-label="清空搜索"
                >
                  <X size={15} />
                </button>
              )}
            </label>
            <button
              className="button button--primary"
              type="button"
              onClick={onImport}
              disabled={isImporting}
            >
              {isImporting ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <Plus size={18} />
              )}
              <span>{isImporting ? "正在导入" : "导入书籍"}</span>
            </button>
          </div>
        </header>

        {!libraryReady ? (
          <div className="loading-state">
            <LoaderCircle className="spin" size={24} />
            <span>正在打开书架</span>
          </div>
        ) : (
          <>
            {recentBook && !query && (
              <section className="continue-reading">
                <button
                  className="continue-cover"
                  type="button"
                  onClick={() => onOpenBook(recentBook)}
                  style={
                    {
                      "--cover-color": recentBook.coverColor,
                      backgroundImage: recentBook.coverImage
                        ? `url(${recentBook.coverImage})`
                        : undefined,
                    } as CSSProperties
                  }
                  aria-label={`继续阅读 ${recentBook.title}`}
                >
                  {!recentBook.coverImage && (
                    <>
                      <span>{truncateTitle(recentBook.title)}</span>
                      <small>{recentBook.author}</small>
                    </>
                  )}
                </button>
                <div className="continue-copy">
                  <span className="status-line">
                    <span className="status-dot" />
                    上次读到
                  </span>
                  <h2>{recentBook.title}</h2>
                  <p>
                    {recentBook.chapters[recentBook.progress.chapterIndex]?.title}
                  </p>
                  <div className="progress-row">
                    <div className="progress-track">
                      <span
                        style={{
                          width: `${calculateBookProgress(
                            recentBook.chapters,
                            recentBook.progress.chapterIndex,
                            recentBook.progress.scrollRatio,
                          )}%`,
                        }}
                      />
                    </div>
                    <span>
                      {calculateBookProgress(
                        recentBook.chapters,
                        recentBook.progress.chapterIndex,
                        recentBook.progress.scrollRatio,
                      )}
                      %
                    </span>
                  </div>
                  <button
                    className="button button--dark"
                    type="button"
                    onClick={() => onOpenBook(recentBook)}
                  >
                    <BookOpen size={18} />
                    继续阅读
                  </button>
                </div>
                <div className="continue-quote" aria-hidden="true">
                  <span>“</span>
                  <p>
                    {recentBook.chapters[
                      recentBook.progress.chapterIndex
                    ]?.content.slice(0, 72)}
                    …
                  </p>
                </div>
              </section>
            )}

            <section className="shelf-section">
              <div className="section-heading">
                <div>
                  <h2>{query ? "搜索结果" : "全部书籍"}</h2>
                  <span>
                    {query ? `${books.length} 本匹配` : `${allBookCount} 本书`}
                  </span>
                </div>
                <button className="sort-button" type="button">
                  最近阅读
                  <ChevronDown size={15} />
                </button>
              </div>

              {books.length ? (
                <div className="book-grid">
                  {books.map((book) => (
                    <article
                      className="book-item"
                      key={book.id}
                      onClick={() => onOpenBook(book)}
                    >
                      <div
                        className="book-cover"
                        style={
                          {
                            "--cover-color": book.coverColor,
                            backgroundImage: book.coverImage
                              ? `url(${book.coverImage})`
                              : undefined,
                          } as CSSProperties
                        }
                      >
                        {!book.coverImage && (
                          <div className="book-cover-type">
                            <span>{truncateTitle(book.title)}</span>
                            <small>{book.author}</small>
                          </div>
                        )}
                        <span className="format-badge">
                          {formatLabels[book.format]}
                        </span>
                        <button
                          className="icon-button book-menu-button"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onBookMenu(bookMenuId === book.id ? null : book.id);
                          }}
                          aria-label={`管理 ${book.title}`}
                        >
                          <MoreHorizontal size={18} />
                        </button>
                        {bookMenuId === book.id && (
                          <div className="book-menu">
                            <button
                              type="button"
                              onClick={(event) => onDelete(event, book.id)}
                            >
                              <Trash2 size={16} />
                              移出书架
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="book-meta">
                        <h3>{book.title}</h3>
                        <p>{book.author}</p>
                        <div>
                          <span>
                            {calculateBookProgress(
                              book.chapters,
                              book.progress.chapterIndex,
                              book.progress.scrollRatio,
                            )}
                            %
                          </span>
                          <span>{formatReadingTime(book)}</span>
                        </div>
                      </div>
                    </article>
                  ))}

                  <button
                    className="add-book-tile"
                    type="button"
                    onClick={onImport}
                  >
                    <span>
                      <Upload size={22} />
                    </span>
                    <strong>导入本地书籍</strong>
                    <small>支持 TXT、EPUB</small>
                  </button>
                </div>
              ) : (
                <div className="empty-state">
                  <BookOpen size={28} />
                  <h3>没有找到这本书</h3>
                  <p>换个关键词，或从本地导入一本新书。</p>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <nav className="mobile-nav" aria-label="移动端导航">
        <button className="mobile-nav-item mobile-nav-item--active" type="button">
          <Library size={20} />
          <span>书架</span>
        </button>
        <button className="mobile-import" type="button" onClick={onImport}>
          <Plus size={22} />
          <span>导入</span>
        </button>
        <button className="mobile-nav-item" type="button" disabled>
          <Clock3 size={20} />
          <span>最近</span>
        </button>
      </nav>
    </div>
  );
}

interface ReaderViewProps {
  book: Book;
  chapterIndex: number;
  paragraphs: string[];
  settings: ReaderSettings;
  drawer: Drawer;
  playerExpanded: boolean;
  speech: ReturnType<typeof useSpeechPlayer>;
  surfaceRef: RefObject<HTMLElement>;
  onBack: () => void;
  onDrawerChange: (drawer: Drawer) => void;
  onPlayerExpandedChange: (expanded: boolean) => void;
  onChapterChange: (index: number) => void;
  onSettingsChange: (patch: Partial<ReaderSettings>) => void;
  onScroll: () => void;
}

function ReaderView({
  book,
  chapterIndex,
  paragraphs,
  settings,
  drawer,
  playerExpanded,
  speech,
  surfaceRef,
  onBack,
  onDrawerChange,
  onPlayerExpandedChange,
  onChapterChange,
  onSettingsChange,
  onScroll,
}: ReaderViewProps) {
  const chapter = book.chapters[chapterIndex];
  const bookProgress = calculateBookProgress(
    book.chapters,
    chapterIndex,
    book.progress.scrollRatio,
  );

  return (
    <div className="reader-shell">
      <header className="reader-toolbar">
        <button
          className="icon-button"
          type="button"
          onClick={onBack}
          aria-label="返回书架"
          title="返回书架"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="reader-book-title">
          <strong>{book.title}</strong>
          <span>{chapter.title}</span>
        </div>
        <div className="reader-toolbar-actions">
          <button
            className={`icon-button ${drawer === "contents" ? "is-active" : ""}`}
            type="button"
            onClick={() =>
              onDrawerChange(drawer === "contents" ? null : "contents")
            }
            aria-label="章节目录"
            title="章节目录"
          >
            <List size={20} />
          </button>
          <button
            className={`icon-button ${drawer === "settings" ? "is-active" : ""}`}
            type="button"
            onClick={() =>
              onDrawerChange(drawer === "settings" ? null : "settings")
            }
            aria-label="阅读设置"
            title="阅读设置"
          >
            <Settings2 size={20} />
          </button>
        </div>
      </header>

      <main
        ref={surfaceRef}
        className="reading-surface"
        onScroll={onScroll}
      >
        <article
          className="reading-page"
          style={
            {
              "--reader-size": `${settings.fontSize}px`,
              "--reader-leading": settings.lineHeight,
              "--reader-width": `${settings.contentWidth}px`,
            } as CSSProperties
          }
        >
          <p className="chapter-kicker">
            第 {chapterIndex + 1} / {book.chapters.length} 章
          </p>
          <h1>{chapter.title}</h1>
          <div
            className={`reading-copy reading-copy--${settings.fontFamily}`}
          >
            {paragraphs.map((paragraph, index) => (
              <p
                key={`${chapter.id}-${index}`}
                data-paragraph-index={index}
                className={
                  speech.status !== "idle" &&
                  index === speech.paragraphIndex
                    ? "is-speaking"
                    : undefined
                }
                onDoubleClick={() => speech.play(index)}
              >
                {paragraph}
              </p>
            ))}
          </div>

          <div className="chapter-navigation">
            <button
              type="button"
              onClick={() => onChapterChange(chapterIndex - 1)}
              disabled={chapterIndex === 0}
            >
              <ChevronLeft size={18} />
              上一章
            </button>
            <span>{bookProgress}%</span>
            <button
              type="button"
              onClick={() => onChapterChange(chapterIndex + 1)}
              disabled={chapterIndex === book.chapters.length - 1}
            >
              下一章
              <ChevronRight size={18} />
            </button>
          </div>
        </article>
      </main>

      <div className="reader-progress" aria-hidden="true">
        <span style={{ width: `${bookProgress}%` }} />
      </div>

      {drawer && (
        <>
          <button
            className="drawer-backdrop"
            type="button"
            onClick={() => onDrawerChange(null)}
            aria-label="关闭面板"
          />
          <aside className="reader-drawer">
            <div className="drawer-heading">
              <div>
                <span>{drawer === "contents" ? "本书目录" : "阅读设置"}</span>
                <strong>
                  {drawer === "contents" ? book.title : "排版与显示"}
                </strong>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => onDrawerChange(null)}
                aria-label="关闭面板"
              >
                <X size={19} />
              </button>
            </div>

            {drawer === "contents" ? (
              <div className="chapter-list">
                {book.chapters.map((item, index) => (
                  <button
                    className={index === chapterIndex ? "is-current" : ""}
                    type="button"
                    key={item.id}
                    onClick={() => onChapterChange(index)}
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{item.title}</strong>
                    {index === chapterIndex && <Check size={16} />}
                  </button>
                ))}
              </div>
            ) : (
              <SettingsPanel
                settings={settings}
                onSettingsChange={onSettingsChange}
              />
            )}
          </aside>
        </>
      )}

      <SpeechPlayer
        book={book}
        chapterTitle={chapter.title}
        settings={settings}
        speech={speech}
        expanded={playerExpanded}
        onExpandedChange={onPlayerExpandedChange}
        onSettingsChange={onSettingsChange}
      />
    </div>
  );
}

function SettingsPanel({
  settings,
  onSettingsChange,
}: {
  settings: ReaderSettings;
  onSettingsChange: (patch: Partial<ReaderSettings>) => void;
}) {
  return (
    <div className="settings-panel">
      <div className="setting-group">
        <div className="setting-label">
          <span>字号</span>
          <strong>{settings.fontSize}</strong>
        </div>
        <div className="stepper">
          <button
            type="button"
            onClick={() =>
              onSettingsChange({
                fontSize: Math.max(15, settings.fontSize - 1),
              })
            }
            aria-label="减小字号"
          >
            A
          </button>
          <div>
            {Array.from({ length: 7 }, (_, index) => (
              <span
                key={index}
                className={
                  index <= Math.round((settings.fontSize - 15) / 2)
                    ? "is-filled"
                    : ""
                }
              />
            ))}
          </div>
          <button
            className="stepper-large"
            type="button"
            onClick={() =>
              onSettingsChange({
                fontSize: Math.min(29, settings.fontSize + 1),
              })
            }
            aria-label="增大字号"
          >
            A
          </button>
        </div>
      </div>

      <div className="setting-group">
        <div className="setting-label">
          <span>字体</span>
        </div>
        <div className="segmented-control">
          <button
            className={settings.fontFamily === "serif" ? "is-selected" : ""}
            type="button"
            onClick={() => onSettingsChange({ fontFamily: "serif" })}
          >
            宋体
          </button>
          <button
            className={settings.fontFamily === "sans" ? "is-selected" : ""}
            type="button"
            onClick={() => onSettingsChange({ fontFamily: "sans" })}
          >
            黑体
          </button>
        </div>
      </div>

      <div className="setting-group">
        <div className="setting-label">
          <span>行距</span>
          <strong>{settings.lineHeight.toFixed(1)}</strong>
        </div>
        <input
          type="range"
          min="1.45"
          max="2.25"
          step="0.1"
          value={settings.lineHeight}
          onChange={(event) =>
            onSettingsChange({ lineHeight: Number(event.target.value) })
          }
        />
      </div>

      <div className="setting-group">
        <div className="setting-label">
          <span>页面宽度</span>
          <strong>{settings.contentWidth}</strong>
        </div>
        <input
          type="range"
          min="560"
          max="880"
          step="40"
          value={settings.contentWidth}
          onChange={(event) =>
            onSettingsChange({ contentWidth: Number(event.target.value) })
          }
        />
      </div>

      <div className="setting-group">
        <div className="setting-label">
          <span>阅读主题</span>
        </div>
        <div className="theme-options">
          {(Object.keys(themeLabels) as ReaderTheme[]).map((theme) => (
            <button
              className={settings.theme === theme ? "is-selected" : ""}
              type="button"
              key={theme}
              onClick={() => onSettingsChange({ theme })}
            >
              <span className={`theme-swatch theme-swatch--${theme}`} />
              {themeLabels[theme]}
              {settings.theme === theme && <Check size={15} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
