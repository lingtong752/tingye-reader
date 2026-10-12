import {
  Headphones,
  Menu,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Square,
  X,
} from "lucide-react";
import type { useSpeechPlayer } from "../hooks/useSpeechPlayer";
import type { Book, ReaderSettings, SpeechStyle } from "../types";

const speechStyleOptions: Array<{
  value: SpeechStyle;
  label: string;
  description: string;
}> = [
  { value: "immersive", label: "沉浸", description: "舒缓、有留白" },
  { value: "natural", label: "自然", description: "接近日常讲述" },
  { value: "clear", label: "清晰", description: "紧凑、信息明确" },
];

interface SpeechPlayerProps {
  book: Book;
  chapterTitle: string;
  settings: ReaderSettings;
  speech: ReturnType<typeof useSpeechPlayer>;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onSettingsChange: (patch: Partial<ReaderSettings>) => void;
}

export function SpeechPlayer({
  book,
  chapterTitle,
  settings,
  speech,
  expanded,
  onExpandedChange,
  onSettingsChange,
}: SpeechPlayerProps) {
  const currentVoice =
    speech.voices.find((voice) => voice.voiceURI === settings.voiceURI) ??
    speech.voices.find((voice) => /^zh/i.test(voice.lang)) ??
    speech.voices[0];
  const progress =
    speech.paragraphs.length > 0
      ? ((speech.paragraphIndex + 1) / speech.paragraphs.length) * 100
      : 0;
  const activeStyle =
    speechStyleOptions.find(
      (option) => option.value === settings.speechStyle,
    ) ?? speechStyleOptions[0];

  return (
    <section
      className={`speech-player ${expanded ? "speech-player--expanded" : ""}`}
      aria-label="听书播放器"
    >
      <button
        className="player-grabber"
        type="button"
        onClick={() => onExpandedChange(!expanded)}
        aria-label={expanded ? "收起听书设置" : "展开听书设置"}
      >
        <span />
      </button>

      {expanded && (
        <div className="player-options">
          <div className="player-options-heading">
            <div>
              <span>正在听</span>
              <strong>{book.title}</strong>
            </div>
            <button
              className="icon-button"
              type="button"
              onClick={speech.stop}
              aria-label="停止朗读"
              title="停止朗读"
            >
              <Square size={17} />
            </button>
          </div>

          {!speech.supported ? (
            <p className="speech-warning">
              当前浏览器不支持系统语音，请使用新版 Chrome、Edge 或 Safari。
            </p>
          ) : (
            <div className="speech-settings">
              <div className="speech-style-setting">
                <div className="speech-setting-label">
                  <span>讲述方式</span>
                  <small>根据标点、对白和情绪调整节奏</small>
                </div>
                <div className="speech-style-control">
                  {speechStyleOptions.map((option) => (
                    <button
                      className={
                        settings.speechStyle === option.value
                          ? "is-selected"
                          : ""
                      }
                      type="button"
                      key={option.value}
                      onClick={() =>
                        onSettingsChange({ speechStyle: option.value })
                      }
                    >
                      <strong>{option.label}</strong>
                      <span>{option.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="player-option-grid">
                <label>
                  <span>设备声音</span>
                  <select
                    value={currentVoice?.voiceURI ?? ""}
                    onChange={(event) =>
                      onSettingsChange({ voiceURI: event.target.value })
                    }
                  >
                    {speech.voices.length ? (
                      speech.voices.map((voice, index) => (
                        <option key={voice.voiceURI} value={voice.voiceURI}>
                          {index === 0 ? "推荐 · " : ""}
                          {voice.name} · {voice.lang}
                        </option>
                      ))
                    ) : (
                      <option value="">系统默认声音</option>
                    )}
                  </select>
                </label>
                <SleepTimerSetting speech={speech} />
              </div>

              {(speech.notice || speech.error) && (
                <p
                  className={
                    speech.error
                      ? "speech-feedback speech-feedback--error"
                      : "speech-feedback"
                  }
                  role={speech.error ? "alert" : "status"}
                >
                  {speech.error ?? speech.notice}
                </p>
              )}
            </div>
          )}
          <p className="privacy-note">
            使用设备内置语音，书籍正文不会上传。部分手机浏览器锁屏后可能暂停朗读。
          </p>
        </div>
      )}

      <div className="player-main">
        <div className="player-track-copy">
          <Headphones size={19} />
          <div>
            <strong>{chapterTitle}</strong>
            <span>
              {speech.status === "playing"
                ? `第 ${speech.paragraphIndex + 1} 段 · 句 ${
                    Math.min(speech.segmentIndex + 1, speech.segmentCount) || 1
                  }/${speech.segmentCount || 1}`
                : speech.status === "paused"
                  ? "朗读已暂停"
                  : `设备语音 · ${activeStyle.label}讲述`}
            </span>
          </div>
        </div>

        <div className="player-controls">
          <button
            className="icon-button"
            type="button"
            onClick={() => speech.seek(speech.paragraphIndex - 1)}
            disabled={!speech.supported}
            aria-label="上一段"
            title="上一段"
          >
            <SkipBack size={19} />
          </button>
          <button
            className="play-button"
            type="button"
            onClick={() =>
              speech.status === "playing" ? speech.pause() : speech.play()
            }
            disabled={!speech.supported}
            aria-label={speech.status === "playing" ? "暂停" : "播放"}
          >
            {speech.status === "playing" ? (
              <Pause size={22} fill="currentColor" />
            ) : (
              <Play size={22} fill="currentColor" />
            )}
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => speech.seek(speech.paragraphIndex + 1)}
            disabled={!speech.supported}
            aria-label="下一段"
            title="下一段"
          >
            <SkipForward size={19} />
          </button>
        </div>

        <div className="player-secondary">
          <button
            className="rate-button"
            type="button"
            onClick={() => {
              const rates = [0.75, 1, 1.25, 1.5, 1.75, 2];
              const next =
                rates[(rates.indexOf(settings.rate) + 1) % rates.length];
              onSettingsChange({ rate: next });
            }}
            aria-label="调整朗读速度"
          >
            {settings.rate}×
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => onExpandedChange(!expanded)}
            aria-label="听书设置"
            title="听书设置"
          >
            {expanded ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </div>

      <div className="player-progress">
        <span style={{ width: `${progress}%` }} />
      </div>
    </section>
  );
}

function SleepTimerSetting({
  speech,
}: {
  speech: ReturnType<typeof useSpeechPlayer>;
}) {
  return (
    <label className="sleep-timer-setting">
      <span>定时停止</span>
      <select
        value={speech.sleepEndsAt ? "active" : "off"}
        onChange={(event) => {
          const value = event.target.value;
          speech.setSleepTimer(value === "off" ? null : Number(value));
        }}
      >
        <option value="off">不开启</option>
        <option value="10">10 分钟</option>
        <option value="20">20 分钟</option>
        <option value="30">30 分钟</option>
        <option value="60">60 分钟</option>
        {speech.sleepEndsAt && <option value="active">定时已开启</option>}
      </select>
    </label>
  );
}
